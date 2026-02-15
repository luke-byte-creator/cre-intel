import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { execSync } from "child_process";

function getGatewayConfig(): { url: string; token: string } {
  try {
    const configPath = path.join(process.env.HOME || "", ".openclaw/openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const port = config.gateway?.port || 18789;
    const token = config.gateway?.auth?.token || "";
    return { url: `http://127.0.0.1:${port}/v1/chat/completions`, token };
  } catch {
    throw new Error("Could not read OpenClaw gateway config");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAI(messages: any[], maxTokens = 8192): Promise<string> {
  const gw = getGatewayConfig();
  const res = await fetch(gw.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${gw.token}` },
    body: JSON.stringify({ model: "anthropic/claude-sonnet-4-20250514", max_tokens: maxTokens, messages }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

const OCCUPIER_INDUSTRIES = [
  "Accommodation, Tourism & Leisure", "Aerospace & Defense", "Agriculture, Forestry, Fishing & Hunting",
  "Arts and Culture", "Automotive", "Building Materials & Construction, Architects & Engineers",
  "Business Services – Administration, Employment Services", "Business Services – Repairs, Maintenance, Waste Removal",
  "Business Services – Accounting, Marketing and Consulting", "E-Commerce", "Education",
  "FIRE (Finance, Insurance & Real Estate)", "Food & Beverage Processing", "Government",
  "Healthcare & Social Assistance", "Legal", "Life Sciences/Scientific & Technical", "Lobbyist",
  "Machinery, Automation & Appliances", "Materials Manufacturing", "Metals Manufacturing", "Mining",
  "Oil & Gas", "Other Services", "Paper, Pulp, Packaging & Printing", "Power & Utilities",
  "Religious & Non-Profits", "Retail", "Technology", "Telecommunications",
  "Transportation/Distribution/Logistics", "Warehousing/Storage", "Wholesale Trade",
];

function buildLeasePrompt(textOrVision: boolean): string {
  return `You are extracting data from a commercial lease/offer-to-lease document to fill a CBRE Trade Record.

Extract ALL of the following fields. Return ONLY valid JSON matching the structure below. Use null for any field not found.

{
  "dealType": "New" or "Renewal" or "Extension",
  "spaceType": "Raw" or "Improved",
  "leaseType": "Direct" or "Sublease",
  "termStart": { "day": number, "month": "Jan"/"Feb"/etc, "year": number },
  "termEnd": { "day": number, "month": "Jan"/"Feb"/etc, "year": number },
  "renewalOption": true or false,
  "renewalDate": "string or null",
  "landlord": {
    "name": "", "contactName": "", "phone": "", "email": "",
    "address": "", "city": "", "province": "", "postalCode": ""
  },
  "tenant": {
    "name": "", "contactName": "", "phone": "", "email": "",
    "address": "", "city": "", "province": "", "postalCode": ""
  },
  "property": {
    "address": "", "city": "", "province": "", "postalCode": ""
  },
  "propertyType": "Land" or "Office" or "Retail" or "Industrial" or "Residential" or "Special Use",
  "totalSF": number,
  "baseAnnualRentPSF": number,
  "monthsFreeRent": number,
  "tenantInducementPSF": number,
  "taxesOperatingCostsPSF": number,
  "occupierIndustry": "one of the standard CBRE occupier industries",
  "buildingClassification": "",
  "spaceUse": "",
  "reasonForTransaction": "Downsizing" or "Expansion" or "Relocation" or "New",
  "cbreListing": true or false,
  "assetPropertyManager": "",
  "beneficialOwner": "",
  "leaseSchedule": [
    { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "rentPSF": number }
  ],
  "commissionRate": number (e.g. 0.05 for 5%),
  "engagedBy": "Landlord" or "Tenant",
  "paidBy": "Landlord" or "Tenant"
}

Occupier Industry must be one of: ${OCCUPIER_INDUSTRIES.join(", ")}

For lease schedule, include ALL rent step periods including any free rent periods (rentPSF: 0).
${textOrVision ? "Extract from the document images provided." : "Extract from the document text provided."}`;
}

function buildSalePrompt(textOrVision: boolean): string {
  return `You are extracting data from a commercial real estate purchase/sale agreement to fill a CBRE Sale Trade Record.

Extract ALL of the following fields. Return ONLY valid JSON. Use null for any field not found.

{
  "fintracRepresentation": "Vendor" or "Buyer" or "Both",
  "vendor": {
    "name": "", "contactName": "", "phone": "",
    "address": "", "city": "", "province": "", "postalCode": ""
  },
  "purchaser": {
    "name": "", "contactName": "", "phone": "",
    "address": "", "city": "", "province": "", "postalCode": ""
  },
  "property": {
    "nameAddress": "", "city": "", "province": "", "postalCode": ""
  },
  "propertyType": "Retail" or "Land" or "Office" or "Multi Housing" or "Industrial" or "Special Use" or "Residential",
  "parcelSizeAcres": number or null,
  "buildingSF": number or null,
  "numberOfUnits": number or null,
  "numberOfBuildings": number or null,
  "portfolio": false,
  "cbreListing": false,
  "listingType": "Open" or "Exclusive" or "MLS" or "Off Market" or null,
  "vendorSolicitor": {
    "name": "", "contactName": "", "phone": "",
    "address": "", "suite": "", "city": "", "province": "", "postalCode": ""
  },
  "purchaserSolicitor": {
    "name": "", "contactName": "", "phone": "",
    "address": "", "suite": "", "city": "", "province": "", "postalCode": ""
  },
  "purchasePrice": number,
  "commissionType": "percentage" or "setFee",
  "commissionPercentage": number or null,
  "commissionSetFee": number or null,
  "dealStatus": "Conditional" or "Firm" or "Closed",
  "closingDate": "YYYY-MM-DD",
  "depositAmount": number or null,
  "depositHeldBy": "",
  "interestBearing": false,
  "occupierIndustry": "",
  "invoiceRecipient": "Vendor" or "Vendor's Lawyer" or "Purchaser" or "Purchaser's Lawyer" or "Outside Broker",
  "assetPropertyManager": "",
  "beneficialOwner": "",
  "engagedBy": "Buyer" or "Vendor",
  "paidBy": "Buyer" or "Vendor"
}

Occupier Industry must be one of: ${OCCUPIER_INDUSTRIES.join(", ")}
${textOrVision ? "Extract from the document images provided." : "Extract from the document text provided."}`;
}

async function extractWithVision(filePath: string, trType: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), "tmp", `pdf-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Convert PDF to JPEG images using pdftoppm
    execSync(`pdftoppm -jpeg -r 200 "${filePath}" "${tmpDir}/page"`, { timeout: 60000 });
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();

    if (files.length === 0) throw new Error("No pages extracted from PDF");

    // Build vision messages - send up to 15 pages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = [];
    const maxPages = Math.min(files.length, 15);
    for (let i = 0; i < maxPages; i++) {
      const imgData = fs.readFileSync(path.join(tmpDir, files[i]));
      const base64 = imgData.toString("base64");
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } });
    }
    content.push({
      type: "text",
      text: trType === "lease" ? buildLeasePrompt(true) : buildSalePrompt(true),
    });

    return await callAI([{ role: "user", content }], 8192);
  } finally {
    // Cleanup
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  }
}

async function extractWithText(text: string, trType: string): Promise<string> {
  const truncated = text.length > 50000 ? text.slice(0, 50000) + "\n...[truncated]" : text;
  const prompt = trType === "lease" ? buildLeasePrompt(false) : buildSalePrompt(false);
  return await callAI([{ role: "user", content: `${prompt}\n\nDOCUMENT TEXT:\n${truncated}` }], 8192);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const trType = (formData.get("type") as string) || "lease";

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Save file temporarily
    const tmpPath = path.join(process.cwd(), "tmp", `upload-${Date.now()}-${file.name}`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    let responseText: string;

    try {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        // Try text extraction first
        const pdfData = await pdfParse(buffer);
        const textLength = pdfData.text.replace(/\s+/g, " ").trim().length;
        const charPerPage = pdfData.numpages > 0 ? textLength / pdfData.numpages : 0;

        // If very little text per page, likely scanned
        if (charPerPage < 100) {
          responseText = await extractWithVision(tmpPath, trType);
        } else {
          responseText = await extractWithText(pdfData.text, trType);
        }
      } else {
        // Non-PDF - try reading as text
        const text = fs.readFileSync(tmpPath, "utf-8");
        responseText = await extractWithText(text, trType);
      }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse extraction response" }, { status: 500 });
    }

    const extracted = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ data: extracted, type: trType });
  } catch (err) {
    console.error("Trade record extraction error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
