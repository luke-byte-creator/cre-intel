import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { extractTextFromFile } from "@/lib/extract-text";
import { applyChangesToDocx, applyChangesToText, type DocumentChange } from "@/lib/docx-edit";

function getGatewayConfig() {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    port: config.gateway?.port || 18789,
    token: config.gateway?.auth?.token || "",
  };
}

async function callAI(messages: { role: string; content: string }[], maxTokens = 8000) {
  const { port, token } = getGatewayConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-20250514",
        messages,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[drafts/generate] AI failed: ${res.status}`, errBody.slice(0, 500));
      throw new Error(`AI call failed: ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeout);
  }
}

const DOC_TYPE_LABELS: Record<string, string> = {
  otl: "Offer to Lease",
  loi: "Letter of Intent",
  renewal: "Lease Renewal",
  lease_amendment: "Lease Amendment",
  sale_offer: "Sale Offer",
  rfp_response: "RFP Response",
  counter_offer: "Counter-Offer",
  lease_agreement: "Lease Agreement",
};

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const formData = await req.formData();
    const documentType = formData.get("documentType") as string;
    const dealId = formData.get("dealId") ? Number(formData.get("dealId")) : null;
    const presetId = formData.get("presetId") ? Number(formData.get("presetId")) : null;
    const instructions = (formData.get("instructions") as string) || "";
    const referenceDoc = formData.get("referenceDoc") as File | null;

    if (!documentType) {
      return NextResponse.json({ error: "documentType is required" }, { status: 400 });
    }

    let fullDocText: string | null = null;
    let referenceDocPath: string | null = null;
    let isDocx = false;

    if (referenceDoc && referenceDoc.size > 0) {
      if (referenceDoc.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
      }

      const draftsDir = path.join(process.cwd(), "data", "drafts");
      if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });

      const ext = path.extname(referenceDoc.name) || ".txt";
      isDocx = ext === ".docx";
      const filename = `${auth.user.id}_${Date.now()}${ext}`;
      referenceDocPath = path.join(draftsDir, filename);

      const bytes = new Uint8Array(await referenceDoc.arrayBuffer());
      fs.writeFileSync(referenceDocPath, bytes);

      fullDocText = await extractTextFromFile(referenceDocPath, referenceDoc.type);
    } else if (presetId) {
      const preset = await db.select().from(schema.documentPresets)
        .where(eq(schema.documentPresets.id, presetId)).limit(1);
      if (!preset[0]) return NextResponse.json({ error: "Preset not found" }, { status: 404 });
      try {
        const parsed = JSON.parse(preset[0].extractedStructure || "{}");
        fullDocText = parsed.raw_text_excerpt || preset[0].extractedStructure || "";
      } catch {
        fullDocText = preset[0].extractedStructure || "";
      }
    } else {
      return NextResponse.json({ error: "Please upload a reference document or select a preset" }, { status: 400 });
    }

    if (!fullDocText || fullDocText.trim().length === 0) {
      return NextResponse.json({ error: "Could not extract text from the reference document" }, { status: 400 });
    }

    // Deal context
    let dealContext = "";
    if (dealId) {
      const deal = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
      if (deal[0]) {
        const d = deal[0];
        dealContext = `\n\nDEAL INFORMATION:\n- Tenant: ${d.tenantName}\n- Company: ${d.tenantCompany || "N/A"}\n- Property: ${d.propertyAddress}`;
        if (d.dealEconomics) {
          try {
            const econ = JSON.parse(d.dealEconomics);
            const inp = econ.inputs || {};
            dealContext += `\n- SF: ${inp.sf || "?"}\n- Rent: $${inp.baseRent || "?"}/SF\n- Term: ${inp.term || "?"} months\n- TI: $${inp.ti || "0"}/SF`;
          } catch {}
        }
      }
    }

    const docTypeLabel = DOC_TYPE_LABELS[documentType] || documentType;
    let generatedContent: string;
    let outputDocxPath: string | null = null;

    if (!instructions || instructions.trim() === "") {
      generatedContent = fullDocText;
    } else {
      // ─── AI produces STRUCTURED changes ───
      const changesResponse = await callAI([
        {
          role: "system",
          content: `You are a document editing assistant for commercial real estate. You receive a document's full text and requested changes from a broker.

Your job: Analyze the instructions and produce a JSON array of STRUCTURED change operations.

CHANGE TYPES:

1. **replace_all** — For names, entities, or terms that appear MULTIPLE TIMES throughout the document. This does a GLOBAL find-replace on every single occurrence.
   { "type": "replace_all", "old": "exact name/term as it appears", "new": "replacement" }
   USE THIS for: landlord names, tenant names, company names, property addresses, any term the user wants changed everywhere.
   IMPORTANT: Check for ALL variations of the name (e.g., "Forster Harvard Developments", "FORSTER HARVARD DEVELOPMENTS", "Forster Harvard"). Create a separate replace_all for each variation.
   ALSO USE THIS for simple term swaps like duration changes (e.g., "Ninety (90) day" → "Six (6) month", "ninety (90) calendar days" → "six (6) months"). If a term appears in multiple places, replace_all catches them all.

2. **replace_value** — For changing a SPECIFIC value (dollar amount, percentage, date, duration) at a PARTICULAR location in the document.
   { "type": "replace_value", "context": "20-30 words surrounding the value to locate it", "old": "exact old value", "new": "new value" }
   USE THIS for: rent amounts, TI allowances, dates, percentages, durations.
   IMPORTANT: When changing rent tables with multiple related values (monthly, yearly, PSF), create a separate replace_value for EACH number that needs to change. Recalculate monthly/yearly amounts based on the square footage in the document.

3. **replace_section** — For modifying a larger block of text (a clause, a paragraph, a sentence).
   { "type": "replace_section", "find": "the existing text to replace (copy verbatim from document)", "replace": "the new text" }
   USE THIS for: rewriting clauses, changing fixturing periods (e.g., "ninety (90) day period" → "Six (6) month period"), modifying terms.
   IMPORTANT: Copy the "find" text EXACTLY from the document — character for character.

4. **add_after** — For ADDING entirely new content that doesn't exist in the document.
   { "type": "add_after", "anchor": "text immediately before where new content should go", "content": "new content to insert" }
   USE THIS for: new clauses, new sections, additional terms.

CRITICAL RULES:
- Be THOROUGH. If the user says "change the landlord name", you must catch EVERY variation in the document.
- For replace_all: look at the document carefully and identify every form of the name (with/without "Inc.", ALL CAPS version, possessive form, etc.)
- For financial changes: always recalculate dependent values (if rent changes, update monthly and yearly amounts too).
- For durations: find ALL mentions — the clause itself AND any references to it elsewhere in the document.
- Return ONLY a valid JSON array. No other text.
- If you're unsure about a change, include it — better to attempt and miss than to skip it.`,
        },
        {
          role: "user",
          content: `DOCUMENT TEXT:

${fullDocText}
${dealContext}

REQUESTED CHANGES:
${instructions}`,
        },
      ]);

      // Parse
      let changes: DocumentChange[] = [];
      try {
        const jsonMatch = changesResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          changes = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("[drafts/generate] Failed to parse changes:", changesResponse.slice(0, 500));
        return NextResponse.json({ error: "AI returned invalid changes format. Please try again." }, { status: 500 });
      }

      console.log(`[drafts/generate] AI produced ${changes.length} changes:`, changes.map(c => c.type));

      if (changes.length === 0) {
        generatedContent = fullDocText;
      } else if (isDocx && referenceDocPath) {
        // Apply directly to .docx XML
        const { buffer, applied, total, log } = await applyChangesToDocx(referenceDocPath, changes);
        console.log(`[drafts/generate] Applied ${applied}/${total} to .docx:`);
        log.forEach(l => console.log(`  ${l}`));

        const draftsDir = path.join(process.cwd(), "data", "drafts");
        const outputFilename = `output_${auth.user.id}_${Date.now()}.docx`;
        outputDocxPath = path.join(draftsDir, outputFilename);
        fs.writeFileSync(outputDocxPath, buffer);

        // Also apply to text for DB
        const textResult = applyChangesToText(fullDocText, changes);
        generatedContent = textResult.text;
      } else {
        // Non-docx fallback
        const textResult = applyChangesToText(fullDocText, changes);
        generatedContent = textResult.text;
        console.log(`[drafts/generate] Applied ${textResult.applied}/${changes.length} to text`);
        textResult.log.forEach(l => console.log(`  ${l}`));
      }
    }

    // Save
    const title = `${docTypeLabel} — ${new Date().toLocaleDateString("en-CA")}`;
    const now = new Date().toISOString();
    const result = await db.insert(schema.documentDrafts).values({
      userId: auth.user.id,
      dealId,
      documentType,
      title,
      referenceDocPath,
      extractedStructure: fullDocText.slice(0, 50000),
      generatedContent,
      finalDocPath: outputDocxPath,
      instructions: instructions || null,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }).returning();

    return NextResponse.json({ draft: result[0], content: generatedContent });
  } catch (e: any) {
    console.error("[drafts/generate] Error:", e);
    const msg = e?.name === "AbortError" ? "Generation timed out" : (e?.message || "Generation failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
