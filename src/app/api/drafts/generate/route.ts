import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { extractTextFromFile } from "@/lib/extract-text";

// Read OpenClaw gateway config
function getGatewayConfig() {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    port: config.gateway?.port || 18789,
    token: config.gateway?.auth?.token || "",
  };
}

async function callAI(messages: { role: string; content: string }[], maxTokens = 32000) {
  const { port, token } = getGatewayConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240000); // 4 min timeout
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
      console.error(`[drafts/generate] AI call failed: ${res.status}`, errBody.slice(0, 500));
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

  // 1. Handle reference doc upload — extract FULL TEXT (not structure summary)
  if (referenceDoc && referenceDoc.size > 0) {
    if (referenceDoc.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const draftsDir = path.join(process.cwd(), "data", "drafts");
    if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });

    const ext = path.extname(referenceDoc.name) || ".txt";
    const filename = `${auth.user.id}_${Date.now()}${ext}`;
    referenceDocPath = path.join(draftsDir, filename);

    const bytes = new Uint8Array(await referenceDoc.arrayBuffer());
    fs.writeFileSync(referenceDocPath, bytes);

    fullDocText = await extractTextFromFile(referenceDocPath, referenceDoc.type);
  }
  // 2. Use preset — load stored full text
  else if (presetId) {
    const preset = await db.select().from(schema.documentPresets)
      .where(eq(schema.documentPresets.id, presetId)).limit(1);
    if (!preset[0]) return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    // extractedStructure on presets still holds the old format — try to get raw_text_excerpt or use as-is
    try {
      const parsed = JSON.parse(preset[0].extractedStructure || "{}");
      fullDocText = parsed.raw_text_excerpt || preset[0].extractedStructure || "";
    } catch {
      fullDocText = preset[0].extractedStructure || "";
    }
  }
  // 3. Neither
  else {
    return NextResponse.json({ error: "Please upload a reference document or select a preset" }, { status: 400 });
  }

  if (!fullDocText || fullDocText.trim().length === 0) {
    return NextResponse.json({ error: "Could not extract text from the reference document" }, { status: 400 });
  }

  // 3. Fetch deal info if linked
  let dealContext = "";
  if (dealId) {
    const deal = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
    if (deal[0]) {
      const d = deal[0];
      dealContext = `\n\nDEAL INFORMATION (use to fill in [BLANK] fields if applicable):\n- Tenant: ${d.tenantName}\n- Company: ${d.tenantCompany || "N/A"}\n- Property: ${d.propertyAddress}\n- Email: ${d.tenantEmail || "N/A"}\n- Phone: ${d.tenantPhone || "N/A"}`;
      if (d.dealEconomics) {
        try {
          const econ = JSON.parse(d.dealEconomics);
          const inp = econ.inputs || {};
          const res = econ.results || {};
          dealContext += `\n- Square Footage: ${inp.sf || "[BLANK]"}\n- Base Rent: $${inp.baseRent || "[BLANK]"}/SF\n- Term: ${inp.term || "[BLANK]"} months\n- Start Date: ${inp.startDate || "[BLANK]"}\n- Free Rent: ${inp.freeRent || "0"} months\n- TI Allowance: $${inp.ti || "0"}/SF\n- Net Effective Rent: $${res.nerYear?.toFixed(2) || "[BLANK]"}/SF/yr`;
          if (inp.rentSteps) dealContext += `\n- Rent Steps: ${inp.rentSteps}`;
        } catch {}
      }
    }
  }

  // 4. Generate the draft — FIND-AND-REPLACE approach
  // AI outputs only the changes as JSON, we apply them to the original text.
  // This is MUCH faster than asking AI to reproduce the entire document.
  const docTypeLabel = DOC_TYPE_LABELS[documentType] || documentType;

  let generatedContent: string;

  if (!instructions || instructions.trim() === "") {
    // No changes requested — use the original text as-is
    generatedContent = fullDocText;
  } else {
    const changesResponse = await callAI([
      {
        role: "system",
        content: `You are a commercial real estate document editor. You will receive a REFERENCE DOCUMENT and REQUESTED CHANGES.

YOUR JOB: Output a JSON array of find-and-replace operations to apply the requested changes to the document.

OUTPUT FORMAT — return ONLY a valid JSON array, no other text:
[
  { "find": "exact text to find in the document", "replace": "replacement text" },
  { "find": "another exact phrase", "replace": "its replacement" }
]

RULES:
- "find" must be an EXACT substring from the reference document (copy it precisely, including punctuation and spacing).
- "find" should be long enough to be unique in the document (include surrounding context words if needed).
- "replace" is the new text that should replace the found text.
- Only include changes that are explicitly requested. Do NOT fix, rephrase, or "improve" anything else.
- If a requested change requires ADDING new text (e.g. a new clause), use "find" to locate the insertion point (the text right before where the new content should go) and include the original text + new text in "replace".
- If a requested change requires REMOVING text, set "replace" to "".
- Use [BLANK] for any values you don't have data for.
- Return an empty array [] if no valid changes can be determined.`,
      },
      {
        role: "user",
        content: `REFERENCE DOCUMENT:

${fullDocText}
${dealContext}

REQUESTED CHANGES:
${instructions}`,
      },
    ], 4000);

    // Parse the JSON changes and apply them
    let changes: Array<{ find: string; replace: string }> = [];
    try {
      const jsonMatch = changesResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        changes = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[drafts/generate] Failed to parse AI changes JSON:", changesResponse.slice(0, 500));
    }

    // Apply changes to the original document
    generatedContent = fullDocText;
    let applied = 0;
    for (const change of changes) {
      if (!change.find || typeof change.replace !== "string") continue;

      // Try exact match first
      if (generatedContent.includes(change.find)) {
        generatedContent = generatedContent.replace(change.find, change.replace);
        applied++;
        continue;
      }

      // Try normalized whitespace match (AI often reformats whitespace)
      const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();
      const findNorm = normalizeWs(change.find);
      // Search through the document with normalized whitespace
      let found = false;
      // Sliding window: find a substring in the original that matches when normalized
      for (let start = 0; start < generatedContent.length && !found; start++) {
        // Only check positions that start with a similar character
        if (generatedContent[start].toLowerCase() !== change.find[0]?.toLowerCase()) continue;
        for (let end = start + findNorm.length - 5; end <= Math.min(start + change.find.length * 2, generatedContent.length); end++) {
          const candidate = generatedContent.slice(start, end);
          if (normalizeWs(candidate) === findNorm) {
            generatedContent = generatedContent.slice(0, start) + change.replace + generatedContent.slice(end);
            found = true;
            applied++;
            break;
          }
        }
      }
      if (!found) {
        console.warn(`[drafts/generate] Could not find: "${change.find.slice(0, 80)}"`);
      }
    }
    console.log(`[drafts/generate] Applied ${applied}/${changes.length} changes`);
  }

  // 5. Save to database
  const title = `${docTypeLabel} — ${new Date().toLocaleDateString("en-CA")}`;
  const now = new Date().toISOString();
  const result = await db.insert(schema.documentDrafts).values({
    userId: auth.user.id,
    dealId,
    documentType,
    title,
    referenceDocPath,
    extractedStructure: fullDocText.slice(0, 50000), // store full text instead of structure summary
    generatedContent,
    instructions: instructions || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json({ draft: result[0], content: generatedContent });
  } catch (e: any) {
    console.error("[drafts/generate] Error:", e);
    const msg = e?.name === "AbortError" ? "Generation timed out — document may be too large" : (e?.message || "Generation failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
