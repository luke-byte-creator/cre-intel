import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";

function getGatewayConfig(): { url: string; token: string } {
  const configPath = path.join(process.env.HOME || "", ".openclaw/openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const port = config.gateway?.port || 18789;
  const token = config.gateway?.auth?.token || "";
  return { url: `http://127.0.0.1:${port}/v1/chat/completions`, token };
}

async function callAI(prompt: string, maxTokens = 8192): Promise<string> {
  const gw = getGatewayConfig();
  const res = await fetch(gw.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${gw.token}` },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function ocrPdfToText(filePath: string, maxPages = 10): Promise<string> {
  const { execSync } = await import("child_process");
  const tmpDir = `/tmp/comp_ocr_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    execSync(`pdftoppm -f 1 -l ${maxPages} -jpeg -r 200 "${filePath}" "${tmpDir}/page"`, { timeout: 60000 });
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();
    const pageTexts: string[] = [];
    for (const file of files) {
      try {
        const text = execSync(`tesseract "${path.join(tmpDir, file)}" stdout -l eng 2>/dev/null`, { timeout: 15000, encoding: "utf-8" });
        if (text.trim().length > 20) pageTexts.push(text.trim());
      } catch { /* skip */ }
    }
    return pageTexts.join("\n\n");
  } finally {
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
      fs.rmdirSync(tmpDir);
    } catch { /* ignore */ }
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
}

const EXTRACTION_PROMPT = `You are a CRE (commercial real estate) data extraction expert. Extract ALL comparable transactions (comps) from this document.

Return ONLY a valid JSON array. Each element must have these fields (use null for unknown):
{
  "type": "Sale" or "Lease",
  "propertyType": string or null,
  "address": string (REQUIRED),
  "city": string (default "Saskatoon"),
  "province": string (default "Saskatchewan"),
  "seller": string or null,
  "purchaser": string or null,
  "landlord": string or null,
  "tenant": string or null,
  "saleDate": "YYYY-MM-DD" or null,
  "salePrice": number or null,
  "pricePSF": number or null,
  "pricePerAcre": number or null,
  "netRentPSF": number or null (annual),
  "annualRent": number or null,
  "areaSF": number or null,
  "landAcres": number or null,
  "landSF": number or null,
  "capRate": number as decimal (0.065 = 6.5%) or null,
  "noi": number or null,
  "yearBuilt": number or null,
  "zoning": string or null,
  "comments": string or null (include zoning info here too if found),
  "termMonths": number or null,
  "leaseStart": "YYYY-MM-DD" or null,
  "leaseExpiry": "YYYY-MM-DD" or null
}

Rules:
- Classify each comp as "Sale" or "Lease" based on context
- If city is not stated, default to "Saskatoon"
- If province is not stated, default to "Saskatchewan"
- Convert all rents to ANNUAL (multiply monthly by 12)
- Cap rates as decimals
- Extract EVERY comp/transaction found, even partial data
- address is REQUIRED — skip entries without one

DOCUMENT TEXT:
`;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

    const filename = file.name;
    const ext = path.extname(filename).toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let text = "";

    if (ext === ".pdf") {
      const data = await pdfParse(buffer);
      const charsPerPage = data.text.trim().length / (data.numpages || 1);
      if (charsPerPage < 100) {
        // Scanned PDF — OCR
        const tmpPath = `/tmp/comp_upload_${Date.now()}.pdf`;
        fs.writeFileSync(tmpPath, buffer);
        try {
          text = await ocrPdfToText(tmpPath);
        } finally {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
        if (!text || text.length < 50) {
          return Response.json({ error: "Could not extract text from scanned PDF. Try a text-based PDF." }, { status: 422 });
        }
      } else {
        text = data.text;
      }
    } else if (ext === ".xlsx" || ext === ".xls") {
      const wb = XLSX.read(buffer);
      const lines: string[] = [];
      for (const name of wb.SheetNames) {
        lines.push(`--- Sheet: ${name} ---`);
        lines.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]));
      }
      text = lines.join("\n");
    } else if (ext === ".csv") {
      text = buffer.toString("utf-8");
    } else {
      return Response.json({ error: "Unsupported file type. Use PDF, Excel, or CSV." }, { status: 400 });
    }

    const prompt = EXTRACTION_PROMPT + truncate(text, 50000);
    const response = await callAI(prompt);

    // Parse JSON array from response
    const match = response.match(/\[[\s\S]*\]/);
    if (!match) {
      return Response.json({ error: "AI could not extract comps from this document.", raw: response }, { status: 422 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let comps: any[];
    try {
      comps = JSON.parse(match[0]);
    } catch {
      return Response.json({ error: "Failed to parse AI response as JSON." }, { status: 422 });
    }

    // Filter out entries without address, ensure type
    comps = comps.filter((c: Record<string, unknown>) => c.address).map((c: Record<string, unknown>) => ({
      ...c,
      type: c.type === "Lease" ? "Lease" : "Sale",
      city: c.city || "Saskatoon",
      province: c.province || "Saskatchewan",
      source: filename,
    }));

    return Response.json({ success: true, comps, filename });
  } catch (err) {
    return Response.json({ error: `Extraction failed: ${(err as Error).message}` }, { status: 500 });
  }
}
