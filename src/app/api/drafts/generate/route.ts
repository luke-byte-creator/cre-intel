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

async function callAI(messages: { role: string; content: string }[], maxTokens = 16000) {
  const { port, token } = getGatewayConfig();
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-20250514",
      messages,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
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

  // 4. Generate the draft — SURGICAL EDIT approach
  // The reference document IS the output. AI only applies the requested changes.
  const docTypeLabel = DOC_TYPE_LABELS[documentType] || documentType;

  const generatedContent = await callAI([
    {
      role: "system",
      content: `You are a commercial real estate document editor. You will receive a REFERENCE DOCUMENT and a set of REQUESTED CHANGES.

YOUR JOB: Reproduce the reference document EXACTLY, word-for-word, with ONLY the requested changes applied.

CRITICAL RULES:
- The reference document is the SOURCE OF TRUTH. Every word, sentence, clause, paragraph, and section that is NOT mentioned in the requested changes MUST remain IDENTICAL.
- Do NOT rephrase, reword, reorganize, or "improve" anything that wasn't explicitly asked to change.
- Do NOT add new clauses, sections, or language unless explicitly requested.
- Do NOT remove any content unless explicitly requested.
- Do NOT change formatting, capitalization, or punctuation unless explicitly requested.
- If a change references a specific field (e.g. "change rent to $45"), find that field in the document and update ONLY that value.
- Use [BLANK] for any information referenced in changes that you don't have a specific value for.
- Output the COMPLETE document — not just the changed parts.
- Preserve the document's original formatting style (numbered sections, lettered subsections, etc.).`,
    },
    {
      role: "user",
      content: `REFERENCE DOCUMENT (reproduce this exactly, applying only the changes below):

${fullDocText}
${dealContext}

REQUESTED CHANGES:
${instructions || "No changes requested — reproduce the document as-is."}`,
    },
  ]);

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
}
