import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";

// Read OpenClaw gateway config
function getGatewayConfig() {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    port: config.gateway?.port || 18789,
    token: config.gateway?.auth?.token || "",
  };
}

async function callAI(messages: { role: string; content: string }[]) {
  const { port, token } = getGatewayConfig();
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-20250514",
      messages,
      max_tokens: 8000,
    }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  if (mimeType === "application/pdf" || filePath.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType.includes("spreadsheet") || filePath.endsWith(".xlsx") || filePath.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer);
    let text = "";
    for (const name of workbook.SheetNames) {
      text += `\n--- Sheet: ${name} ---\n`;
      text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    }
    return text;
  }

  // Plain text fallback
  return buffer.toString("utf-8");
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

  let extractedStructure: string | null = null;
  let referenceDocPath: string | null = null;

  // 1. Handle reference doc upload
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

    // Extract text
    const docText = await extractTextFromFile(referenceDocPath, referenceDoc.type);

    // Call AI to extract structure
    const extractionResponse = await callAI([
      {
        role: "system",
        content: `You are a document structure analyzer for commercial real estate documents. Analyze the provided document and extract its structure as JSON. Return ONLY valid JSON with this format:
{
  "sections": [
    { "title": "Section title", "content_summary": "Brief summary of what this section covers", "is_standard_language": true/false, "has_deal_specific_fields": true/false }
  ],
  "language_style": "formal/semi-formal/casual",
  "formatting_notes": "Any notable formatting patterns",
  "typical_fields_used": ["list", "of", "fields", "found"],
  "raw_text_excerpt": "First 2000 chars of extracted text for reference"
}`,
      },
      {
        role: "user",
        content: `Analyze this ${DOC_TYPE_LABELS[documentType] || documentType} document and extract its structure:\n\n${docText.slice(0, 15000)}`,
      },
    ]);

    try {
      // Try to parse the JSON from the response
      const jsonMatch = extractionResponse.match(/\{[\s\S]*\}/);
      extractedStructure = jsonMatch ? jsonMatch[0] : extractionResponse;
      JSON.parse(extractedStructure!); // validate
    } catch {
      extractedStructure = JSON.stringify({
        sections: [{ title: "Full Document", content_summary: "Could not parse structure", is_standard_language: true, has_deal_specific_fields: true }],
        language_style: "formal",
        formatting_notes: "Structure extraction failed, using raw text",
        typical_fields_used: [],
        raw_text_excerpt: docText.slice(0, 2000),
      });
    }
  }
  // 2. Use preset
  else if (presetId) {
    const preset = await db.select().from(schema.documentPresets)
      .where(eq(schema.documentPresets.id, presetId)).limit(1);
    if (!preset[0]) return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    extractedStructure = preset[0].extractedStructure;
  }
  // 3. Neither
  else {
    return NextResponse.json({ error: "Please upload a reference document or select a preset" }, { status: 400 });
  }

  // 4. Fetch deal info if linked
  let dealContext = "";
  if (dealId) {
    const deal = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
    if (deal[0]) {
      const d = deal[0];
      dealContext = `\n\nDEAL INFORMATION:\n- Tenant: ${d.tenantName}\n- Company: ${d.tenantCompany || "N/A"}\n- Property: ${d.propertyAddress}\n- Email: ${d.tenantEmail || "N/A"}\n- Phone: ${d.tenantPhone || "N/A"}`;
      if (d.dealEconomics) {
        try {
          const econ = JSON.parse(d.dealEconomics);
          const inp = econ.inputs || {};
          const res = econ.results || {};
          dealContext += `\n\nDEAL ECONOMICS:\n- Square Footage: ${inp.sf || "[BLANK]"}\n- Base Rent: $${inp.baseRent || "[BLANK]"}/SF\n- Term: ${inp.term || "[BLANK]"} months\n- Start Date: ${inp.startDate || "[BLANK]"}\n- Free Rent: ${inp.freeRent || "0"} months\n- TI Allowance: $${inp.ti || "0"}/SF\n- Commission Rate: ${inp.commRate || "[BLANK]"}%\n- Other Expenses: $${inp.otherExpense || "0"}\n- Net Effective Rent: $${res.nerYear?.toFixed(2) || "[BLANK]"}/SF/yr\n- Total Consideration: $${res.totalConsideration?.toFixed(0) || "[BLANK]"}\n- Commission: $${res.commission?.toFixed(0) || "[BLANK]"}`;
          if (inp.rentSteps) dealContext += `\n- Rent Steps: ${inp.rentSteps}`;
        } catch {}
      }
    }
  }

  // 5. Generate the draft
  const docTypeLabel = DOC_TYPE_LABELS[documentType] || documentType;
  const generatedContent = await callAI([
    {
      role: "system",
      content: `You are a commercial real estate document drafter. Generate a ${docTypeLabel} following the provided structure exactly.

CRITICAL RULES:
- Do NOT invent or hallucinate any legal clauses, dollar amounts, dates, or terms not provided in the deal data or reference structure.
- Use [BLANK] for any missing information you don't have data for.
- Follow the extracted structure's section order, language style, and formatting.
- Fill in deal-specific data from the provided economics where available.
- Maintain the same level of formality as the reference document.
- Output the document as clean, formatted text ready for use.`,
    },
    {
      role: "user",
      content: `Generate a ${docTypeLabel} based on this structure:\n\n${extractedStructure}${dealContext}${instructions ? `\n\nADDITIONAL INSTRUCTIONS:\n${instructions}` : ""}`,
    },
  ]);

  // 6. Save to database
  const title = `${docTypeLabel}${dealId ? "" : ""} — ${new Date().toLocaleDateString("en-CA")}`;
  const now = new Date().toISOString();
  const result = await db.insert(schema.documentDrafts).values({
    userId: auth.user.id,
    dealId,
    documentType,
    title,
    referenceDocPath,
    extractedStructure,
    generatedContent,
    instructions: instructions || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json({ draft: result[0], content: generatedContent });
}
