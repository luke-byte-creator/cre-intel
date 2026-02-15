import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcquisitionInputs {
  // Property
  propertyName?: string;
  propertyAddress?: string;
  city?: string;
  propertyType?: string;
  nraSF?: number;
  landArea?: number;
  yearBuilt?: number;
  floors?: number;
  parking?: string;

  // Pricing
  askingPrice?: number;
  askingCapRate?: number;

  // Revenue
  baseRent?: number;
  recoveryIncome?: number;
  parkingIncome?: number;
  otherIncome?: number;
  vacancyRate?: number;

  // Expenses
  propertyTax?: number;
  insurance?: number;
  utilities?: number;
  repairsMaint?: number;
  management?: number;
  managementPct?: number;
  admin?: number;
  payroll?: number;
  marketing?: number;
  otherExpenses?: number;
  totalExpenses?: number;

  // NOI
  noi?: number;

  // Growth assumptions
  incomeGrowth?: number;
  expenseGrowth?: number;
  propertyTaxGrowth?: number;
  capexGrowth?: number;

  // Capital
  capitalReservesPSF?: number;
  closingCostsPct?: number;
  sellingCostsPct?: number;

  // Analysis
  analysisPeriod?: number;

  // Assessment / Appraisal
  assessedValue?: number;
  appraisedValue?: number;

  // Rent roll
  tenants?: TenantRow[];

  // Historical
  historical?: {
    t2?: { year: number; revenue: number; expenses: number; noi: number };
    t1?: { year: number; revenue: number; expenses: number; noi: number };
    t12?: { year: number; revenue: number; expenses: number; noi: number };
  };
}

export interface TenantRow {
  tenantName: string;
  suite?: string;
  sf?: number;
  leaseStart?: string;
  leaseExpiry?: string;
  baseRentPSF?: number;
  baseRentAnnual?: number;
  recoveryType?: string;
  recoveryPSF?: number;
  escalationType?: string;
  escalationRate?: number;
  isVacant?: boolean;
}

export interface ExtractionResult {
  inputs: Partial<AcquisitionInputs>;
  auditTrail: AuditEntry[];
  warnings: string[];
  conflicts: ConflictEntry[];
}

export interface AuditEntry {
  field: string;
  value: string;
  sourceDoc: string;
  page: string;
  confidence: "high" | "medium" | "low" | "default" | "manual";
  sourceText: string;
  reasoning: string;
}

export interface ConflictEntry {
  field: string;
  values: { value: number | string; source: string; label: string }[];
  resolution: string;
}

interface DocumentInput {
  filename: string;
  filePath: string;
  docType?: string;
}

interface ClassifiedDoc extends DocumentInput {
  classifiedType: string;
  text: string;
  confidence: string;
}

// ---------------------------------------------------------------------------
// Gateway config
// ---------------------------------------------------------------------------

function getGatewayConfig(): { url: string; token: string } {
  try {
    const configPath = path.join(process.env.HOME || "", ".openclaw/openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const port = config.gateway?.port || 18789;
    const token = config.gateway?.auth?.token || "";
    return { url: `http://127.0.0.1:${port}/v1/chat/completions`, token };
  } catch {
    // fall through
  }
  throw new Error("Could not read OpenClaw gateway config");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAI(prompt: string | any[], maxTokens = 4096): Promise<string> {
  const gw = getGatewayConfig();
  // Support both simple string prompts and multimodal content arrays
  const content = typeof prompt === "string" ? prompt : prompt;
  const res = await fetch(gw.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gw.token}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Convert PDF pages to base64 JPEG images using pdftoppm
async function pdfPagesToBase64(filePath: string, maxPages = 8): Promise<string[]> {
  const { execSync } = await import("child_process");
  const tmpDir = `/tmp/pdf_vision_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  
  try {
    // Get page count
    const infoOutput = execSync(`pdfinfo "${filePath}" 2>/dev/null`, { encoding: "utf-8" });
    const pagesMatch = infoOutput.match(/Pages:\s+(\d+)/);
    const totalPages = pagesMatch ? parseInt(pagesMatch[1]) : 1;
    const pagesToProcess = Math.min(totalPages, maxPages);
    
    // Convert pages to JPEG
    execSync(`pdftoppm -f 1 -l ${pagesToProcess} -jpeg -r 150 "${filePath}" "${tmpDir}/page"`, { timeout: 30000 });
    
    // Read and encode
    const images: string[] = [];
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();
    for (const file of files) {
      const buffer = fs.readFileSync(path.join(tmpDir, file));
      images.push(buffer.toString("base64"));
    }
    return images;
  } finally {
    // Cleanup
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
      fs.rmdirSync(tmpDir);
    } catch { /* ignore cleanup errors */ }
  }
}

// OCR scanned PDF pages to text using tesseract, then call AI with text
async function ocrPdfToText(filePath: string, maxPages = 10): Promise<string> {
  const { execSync } = await import("child_process");
  const tmpDir = `/tmp/pdf_ocr_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  
  try {
    execSync(`pdftoppm -f 1 -l ${maxPages} -jpeg -r 200 "${filePath}" "${tmpDir}/page"`, { timeout: 60000 });
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();
    
    const pageTexts: string[] = [];
    for (const file of files) {
      try {
        const text = execSync(`tesseract "${path.join(tmpDir, file)}" stdout -l eng 2>/dev/null`, { timeout: 15000, encoding: "utf-8" });
        if (text.trim().length > 20) {
          pageTexts.push(text.trim());
        }
      } catch { /* skip failed pages */ }
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

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    // Detect scanned PDFs: very little text relative to page count
    const textLen = data.text.trim().length;
    const pageCount = data.numpages || 1;
    const charsPerPage = textLen / pageCount;
    if (charsPerPage < 100) {
      // Likely scanned — mark for vision extraction
      return `[SCANNED_PDF:${filePath}]`;
    }
    return data.text;
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.readFile(filePath);
    const lines: string[] = [];
    for (const name of wb.SheetNames) {
      lines.push(`--- Sheet: ${name} ---`);
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      lines.push(csv);
    }
    return lines.join("\n");
  }
  if (ext === ".csv") {
    return fs.readFileSync(filePath, "utf-8");
  }
  // Images — placeholder
  if ([".jpg", ".png", ".jpeg", ".gif", ".webp"].includes(ext)) {
    return `[Image file: ${path.basename(filePath)} — vision extraction not yet implemented]`;
  }
  return fs.readFileSync(filePath, "utf-8");
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) + "\n...[truncated]" : text;
}

// ---------------------------------------------------------------------------
// Step 1: Classify documents
// ---------------------------------------------------------------------------

async function classifyDocuments(docs: { filename: string; text: string }[]): Promise<Record<string, string>> {
  const summaries = docs.map((d) => {
    const preview = truncate(d.text, 3000);
    return `DOCUMENT: "${d.filename}"\n---\n${preview}\n---`;
  });

  const prompt = `You are a CRE document classifier. For each document below, classify it as one of:
- offering_memorandum
- rent_roll
- operating_statement
- tax_assessment
- appraisal
- financial_statement
- lease_agreement (an individual lease, offer to lease, sublease, or lease amendment for a SINGLE tenant)
- other

Return ONLY valid JSON — an object mapping filename to docType.
Example: {"Property_Package.pdf": "offering_memorandum", "Rent_Roll.xlsx": "rent_roll", "Tenant_Lease.pdf": "lease_agreement"}

${summaries.join("\n\n")}`;

  const response = await callAI(prompt, 1024);
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // fall through
  }
  // Fallback: classify everything as other
  const result: Record<string, string> = {};
  for (const d of docs) result[d.filename] = "other";
  return result;
}

// ---------------------------------------------------------------------------
// Step 2: Extract per document type
// ---------------------------------------------------------------------------

function buildExtractionPrompt(docType: string, text: string, filename: string): string {
  const truncatedText = truncate(text, 30000);

  const commonInstructions = `Return ONLY valid JSON. For any field not found, use null. Include "page" (best guess or "unknown") and "confidence" ("high", "medium", or "low") for each value.`;

  if (docType === "offering_memorandum") {
    return `You are a senior CRE financial analyst extracting data from an offering memorandum.
Document: "${filename}"

${commonInstructions}

Extract into this structure:
{
  "property": {
    "name": {"value": null, "page": "", "confidence": "low"},
    "address": {"value": null, "page": "", "confidence": "low"},
    "city": {"value": null, "page": "", "confidence": "low"},
    "propertyType": {"value": null, "page": "", "confidence": "low"},
    "nraSF": {"value": null, "page": "", "confidence": "low"},
    "landArea": {"value": null, "page": "", "confidence": "low"},
    "yearBuilt": {"value": null, "page": "", "confidence": "low"},
    "floors": {"value": null, "page": "", "confidence": "low"},
    "parking": {"value": null, "page": "", "confidence": "low"}
  },
  "financial": {
    "askingPrice": {"value": null, "page": "", "confidence": "low"},
    "askingCapRate": {"value": null, "page": "", "confidence": "low"},
    "baseRent": {"value": null, "page": "", "confidence": "low"},
    "recoveryIncome": {"value": null, "page": "", "confidence": "low"},
    "parkingIncome": {"value": null, "page": "", "confidence": "low"},
    "otherIncome": {"value": null, "page": "", "confidence": "low"},
    "vacancyRate": {"value": null, "page": "", "confidence": "low"},
    "totalExpenses": {"value": null, "page": "", "confidence": "low"},
    "noi": {"value": null, "page": "", "confidence": "low"}
  },
  "expenses": {
    "propertyTax": {"value": null, "page": "", "confidence": "low"},
    "insurance": {"value": null, "page": "", "confidence": "low"},
    "utilities": {"value": null, "page": "", "confidence": "low"},
    "repairsMaint": {"value": null, "page": "", "confidence": "low"},
    "management": {"value": null, "page": "", "confidence": "low"},
    "admin": {"value": null, "page": "", "confidence": "low"},
    "payroll": {"value": null, "page": "", "confidence": "low"},
    "marketing": {"value": null, "page": "", "confidence": "low"},
    "other": {"value": null, "page": "", "confidence": "low"}
  },
  "historical": {
    "t2": {"year": null, "revenue": null, "expenses": null, "noi": null},
    "t1": {"year": null, "revenue": null, "expenses": null, "noi": null},
    "t12": {"year": null, "revenue": null, "expenses": null, "noi": null}
  }
}

IMPORTANT:
- All dollar amounts should be ANNUAL totals (not monthly, not PSF)
- If rent is given as monthly, multiply by 12
- Cap rates should be decimals (e.g., 0.065 for 6.5%)
- Vacancy should be a decimal (e.g., 0.05 for 5%)

DOCUMENT TEXT:
${truncatedText}`;
  }

  if (docType === "rent_roll") {
    return `You are a CRE analyst extracting a rent roll.
Document: "${filename}"

${commonInstructions}

Extract into this structure:
{
  "tenants": [
    {
      "tenantName": "",
      "suite": "",
      "sf": null,
      "leaseStart": null,
      "leaseExpiry": null,
      "baseRentPSF": null,
      "baseRentAnnual": null,
      "recoveryType": null,
      "recoveryPSF": null,
      "escalationType": null,
      "escalationRate": null,
      "isVacant": false,
      "confidence": "medium",
      "page": ""
    }
  ],
  "summary": {
    "totalLeasedSF": null,
    "totalNRA": null,
    "occupancyRate": null,
    "totalBaseRent": null
  }
}

IMPORTANT:
- baseRentPSF should be ANNUAL $/SF
- If monthly rent is given, convert to annual (*12)
- If only total and SF are given, calculate PSF
- Mark vacant suites with isVacant: true

DOCUMENT TEXT:
${truncatedText}`;
  }

  if (docType === "operating_statement" || docType === "financial_statement") {
    return `You are a CRE analyst extracting an operating/financial statement.
Document: "${filename}"

${commonInstructions}

Extract into this structure:
{
  "revenue": {
    "baseRent": {"value": null, "page": "", "confidence": "low"},
    "recoveryIncome": {"value": null, "page": "", "confidence": "low"},
    "parkingIncome": {"value": null, "page": "", "confidence": "low"},
    "otherIncome": {"value": null, "page": "", "confidence": "low"},
    "totalRevenue": {"value": null, "page": "", "confidence": "low"}
  },
  "expenses": {
    "propertyTax": {"value": null, "page": "", "confidence": "low"},
    "insurance": {"value": null, "page": "", "confidence": "low"},
    "utilities": {"value": null, "page": "", "confidence": "low"},
    "repairsMaint": {"value": null, "page": "", "confidence": "low"},
    "management": {"value": null, "page": "", "confidence": "low"},
    "admin": {"value": null, "page": "", "confidence": "low"},
    "payroll": {"value": null, "page": "", "confidence": "low"},
    "marketing": {"value": null, "page": "", "confidence": "low"},
    "other": {"value": null, "page": "", "confidence": "low"},
    "totalExpenses": {"value": null, "page": "", "confidence": "low"}
  },
  "noi": {"value": null, "page": "", "confidence": "low"},
  "historical": {
    "t2": {"year": null, "revenue": null, "expenses": null, "noi": null},
    "t1": {"year": null, "revenue": null, "expenses": null, "noi": null},
    "t12": {"year": null, "revenue": null, "expenses": null, "noi": null}
  }
}

All amounts should be ANNUAL.

DOCUMENT TEXT:
${truncatedText}`;
  }

  if (docType === "tax_assessment") {
    return `You are a CRE analyst extracting tax assessment data.
Document: "${filename}"

${commonInstructions}

Extract:
{
  "assessedValue": {"value": null, "page": "", "confidence": "low"},
  "propertyTax": {"value": null, "page": "", "confidence": "low"},
  "millRate": {"value": null, "page": "", "confidence": "low"},
  "assessmentDate": {"value": null, "page": "", "confidence": "low"}
}

DOCUMENT TEXT:
${truncatedText}`;
  }

  if (docType === "lease_agreement") {
    return `You are a senior CRE analyst extracting key lease terms from an individual lease or offer to lease.
Document: "${filename}"

${commonInstructions}

Extract into this structure:
{
  "tenant": {
    "tenantName": {"value": null, "page": "", "confidence": "low"},
    "suite": {"value": null, "page": "", "confidence": "low"},
    "sf": {"value": null, "page": "", "confidence": "low"},
    "leaseStart": {"value": null, "page": "", "confidence": "low"},
    "leaseExpiry": {"value": null, "page": "", "confidence": "low"},
    "baseRentPSF": {"value": null, "page": "", "confidence": "low"},
    "baseRentAnnual": {"value": null, "page": "", "confidence": "low"},
    "recoveryType": {"value": null, "page": "", "confidence": "low"},
    "recoveryPSF": {"value": null, "page": "", "confidence": "low"},
    "escalationType": {"value": null, "page": "", "confidence": "low"},
    "escalationRate": {"value": null, "page": "", "confidence": "low"},
    "freeRentMonths": {"value": null, "page": "", "confidence": "low"},
    "tiAllowancePSF": {"value": null, "page": "", "confidence": "low"},
    "renewalOptions": {"value": null, "page": "", "confidence": "low"}
  },
  "property": {
    "name": {"value": null, "page": "", "confidence": "low"},
    "address": {"value": null, "page": "", "confidence": "low"},
    "city": {"value": null, "page": "", "confidence": "low"},
    "propertyType": {"value": null, "page": "", "confidence": "low"}
  },
  "landlord": {
    "name": {"value": null, "page": "", "confidence": "low"}
  },
  "rentSteps": [
    {"startDate": null, "endDate": null, "rentPSF": null, "rentAnnual": null}
  ]
}

IMPORTANT:
- baseRentPSF should be ANNUAL $/SF (not monthly). If monthly, multiply by 12.
- If only total rent and SF given, calculate PSF = total / SF.
- If rent is described as "net" or "triple net" or "NNN", recoveryType is "NNN".
- If there are multiple rent periods/escalations, list them all in rentSteps.
- leaseStart and leaseExpiry should be ISO date format (YYYY-MM-DD) if possible.
- sf should be numeric only (no commas).
- Look for the tenant name in the first few pages — it's usually defined as "Tenant" or "Lessee".

DOCUMENT TEXT:
${truncatedText}`;
  }

  if (docType === "appraisal") {
    return `You are a CRE analyst extracting appraisal data.
Document: "${filename}"

${commonInstructions}

Extract:
{
  "appraisedValue": {"value": null, "page": "", "confidence": "low"},
  "capRate": {"value": null, "page": "", "confidence": "low"},
  "landValue": {"value": null, "page": "", "confidence": "low"},
  "noi": {"value": null, "page": "", "confidence": "low"}
}

Cap rate should be decimal (0.065 for 6.5%).

DOCUMENT TEXT:
${truncatedText}`;
  }

  // Generic / other
  return `You are a CRE analyst. Extract any financial or property data from this document.
Document: "${filename}"

${commonInstructions}

Return any relevant fields as:
{
  "fields": [
    {"name": "fieldName", "value": "...", "page": "", "confidence": "low"}
  ]
}

DOCUMENT TEXT:
${truncatedText}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParseJSON(text: string): any {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {
    // fall through
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFieldValue(obj: any): { value: any; page: string; confidence: string } {
  if (obj && typeof obj === "object" && "value" in obj) {
    return {
      value: obj.value,
      page: String(obj.page || "unknown"),
      confidence: obj.confidence || "medium",
    };
  }
  return { value: obj, page: "unknown", confidence: "medium" };
}

// ---------------------------------------------------------------------------
// Step 3: Merge extractions into AcquisitionInputs
// ---------------------------------------------------------------------------

function mergeExtractions(
  classifiedDocs: ClassifiedDoc[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractions: { doc: ClassifiedDoc; data: any }[]
): { inputs: Partial<AcquisitionInputs>; auditTrail: AuditEntry[]; conflicts: ConflictEntry[] } {
  const inputs: Partial<AcquisitionInputs> = {};
  const auditTrail: AuditEntry[] = [];
  const conflicts: ConflictEntry[] = [];

  // Track all values per field for conflict detection
  const fieldValues: Record<string, { value: number | string; source: string; page: string; confidence: string }[]> = {};

  function recordField(
    field: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: any,
    sourceDoc: string,
    fallbackPage = "unknown"
  ) {
    const { value, page, confidence } = extractFieldValue(raw);
    if (value === null || value === undefined || value === "") return;

    const numVal = typeof value === "string" ? parseFloat(value.replace(/[,$%]/g, "")) : value;
    const finalVal = isNaN(numVal as number) ? value : numVal;

    if (!fieldValues[field]) fieldValues[field] = [];
    fieldValues[field].push({
      value: finalVal as number | string,
      source: sourceDoc,
      page: page || fallbackPage,
      confidence,
    });
  }

  for (const { doc, data } of extractions) {
    if (!data) continue;
    const src = doc.filename;

    if (doc.classifiedType === "offering_memorandum") {
      const p = data.property || {};
      const f = data.financial || {};
      const e = data.expenses || {};

      recordField("propertyName", p.name, src);
      recordField("propertyAddress", p.address, src);
      recordField("city", p.city, src);
      recordField("propertyType", p.propertyType, src);
      recordField("nraSF", p.nraSF, src);
      recordField("landArea", p.landArea, src);
      recordField("yearBuilt", p.yearBuilt, src);
      recordField("floors", p.floors, src);
      recordField("parking", p.parking, src);

      recordField("askingPrice", f.askingPrice, src);
      recordField("askingCapRate", f.askingCapRate, src);
      recordField("baseRent", f.baseRent, src);
      recordField("recoveryIncome", f.recoveryIncome, src);
      recordField("parkingIncome", f.parkingIncome, src);
      recordField("otherIncome", f.otherIncome, src);
      recordField("vacancyRate", f.vacancyRate, src);
      recordField("totalExpenses", f.totalExpenses, src);
      recordField("noi", f.noi, src);

      recordField("propertyTax", e.propertyTax, src);
      recordField("insurance", e.insurance, src);
      recordField("utilities", e.utilities, src);
      recordField("repairsMaint", e.repairsMaint, src);
      recordField("management", e.management, src);
      recordField("admin", e.admin, src);
      recordField("payroll", e.payroll, src);
      recordField("marketing", e.marketing, src);
      recordField("otherExpenses", e.other, src);

      if (data.historical) {
        if (!inputs.historical) inputs.historical = {};
        for (const period of ["t2", "t1", "t12"] as const) {
          const h = data.historical[period];
          if (h && h.year) {
            inputs.historical[period] = {
              year: h.year,
              revenue: h.revenue || 0,
              expenses: h.expenses || 0,
              noi: h.noi || 0,
            };
          }
        }
      }
    }

    if (doc.classifiedType === "rent_roll") {
      if (data.tenants && Array.isArray(data.tenants)) {
        inputs.tenants = data.tenants.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (t: any) => ({
            tenantName: t.tenantName || "Unknown",
            suite: t.suite || undefined,
            sf: t.sf || undefined,
            leaseStart: t.leaseStart || undefined,
            leaseExpiry: t.leaseExpiry || undefined,
            baseRentPSF: t.baseRentPSF || undefined,
            baseRentAnnual: t.baseRentAnnual || undefined,
            recoveryType: t.recoveryType || undefined,
            recoveryPSF: t.recoveryPSF || undefined,
            escalationType: t.escalationType || undefined,
            escalationRate: t.escalationRate || undefined,
            isVacant: t.isVacant || false,
          })
        );
        // Compute total base rent from rent roll
        const rrTotal = inputs.tenants!.reduce((sum, t) => sum + (t.baseRentAnnual || 0), 0);
        if (rrTotal > 0) {
          recordField("baseRent", { value: rrTotal, page: "rent roll", confidence: "high" }, src);
        }
      }
      if (data.summary) {
        if (data.summary.totalNRA) recordField("nraSF", { value: data.summary.totalNRA, page: "rent roll", confidence: "high" }, src);
        if (data.summary.totalBaseRent) recordField("baseRent", { value: data.summary.totalBaseRent, page: "rent roll", confidence: "high" }, src);
      }
    }

    if (doc.classifiedType === "operating_statement" || doc.classifiedType === "financial_statement") {
      const r = data.revenue || {};
      const e = data.expenses || {};

      recordField("baseRent", r.baseRent, src);
      recordField("recoveryIncome", r.recoveryIncome, src);
      recordField("parkingIncome", r.parkingIncome, src);
      recordField("otherIncome", r.otherIncome, src);

      recordField("propertyTax", e.propertyTax, src);
      recordField("insurance", e.insurance, src);
      recordField("utilities", e.utilities, src);
      recordField("repairsMaint", e.repairsMaint, src);
      recordField("management", e.management, src);
      recordField("admin", e.admin, src);
      recordField("payroll", e.payroll, src);
      recordField("marketing", e.marketing, src);
      recordField("otherExpenses", e.other, src);
      recordField("totalExpenses", e.totalExpenses, src);
      recordField("noi", data.noi, src);

      if (data.historical) {
        if (!inputs.historical) inputs.historical = {};
        for (const period of ["t2", "t1", "t12"] as const) {
          const h = data.historical[period];
          if (h && h.year) {
            inputs.historical[period] = {
              year: h.year,
              revenue: h.revenue || 0,
              expenses: h.expenses || 0,
              noi: h.noi || 0,
            };
          }
        }
      }
    }

    if (doc.classifiedType === "lease_agreement") {
      // Each lease becomes one tenant in the rent roll
      if (data.tenant) {
        const t = data.tenant;
        const tenantName = extractFieldValue(t.tenantName).value;
        const sf = extractFieldValue(t.sf).value;
        const baseRentPSF = extractFieldValue(t.baseRentPSF).value;
        const baseRentAnnual = extractFieldValue(t.baseRentAnnual).value;
        
        if (!inputs.tenants) inputs.tenants = [];
        
        const tenant: TenantRow = {
          tenantName: tenantName || `Unknown (${doc.filename})`,
          suite: extractFieldValue(t.suite).value || undefined,
          sf: typeof sf === "number" ? sf : sf ? parseFloat(String(sf).replace(/[,\s]/g, "")) : undefined,
          leaseStart: extractFieldValue(t.leaseStart).value || undefined,
          leaseExpiry: extractFieldValue(t.leaseExpiry).value || undefined,
          baseRentPSF: typeof baseRentPSF === "number" ? baseRentPSF : baseRentPSF ? parseFloat(String(baseRentPSF).replace(/[,$]/g, "")) : undefined,
          baseRentAnnual: typeof baseRentAnnual === "number" ? baseRentAnnual : baseRentAnnual ? parseFloat(String(baseRentAnnual).replace(/[,$]/g, "")) : undefined,
          recoveryType: extractFieldValue(t.recoveryType).value || undefined,
          recoveryPSF: (() => { const v = extractFieldValue(t.recoveryPSF).value; return typeof v === "number" ? v : v ? parseFloat(String(v).replace(/[,$]/g, "")) : undefined; })(),
          escalationType: extractFieldValue(t.escalationType).value || undefined,
          escalationRate: (() => { const v = extractFieldValue(t.escalationRate).value; return typeof v === "number" ? v : v ? parseFloat(String(v).replace(/[,$]/g, "")) : undefined; })(),
          isVacant: false,
        };
        
        // Calculate missing fields
        if (tenant.sf && tenant.baseRentPSF && !tenant.baseRentAnnual) {
          tenant.baseRentAnnual = tenant.sf * tenant.baseRentPSF;
        }
        if (tenant.sf && tenant.baseRentAnnual && !tenant.baseRentPSF) {
          tenant.baseRentPSF = tenant.baseRentAnnual / tenant.sf;
        }
        
        inputs.tenants.push(tenant);
        
        auditTrail.push({
          field: `tenant:${tenant.tenantName}`,
          value: `${tenant.sf || "?"} SF @ $${tenant.baseRentPSF || "?"}/SF`,
          sourceDoc: src,
          page: extractFieldValue(t.sf).page || "unknown",
          confidence: extractFieldValue(t.sf).confidence as AuditEntry["confidence"] || "medium",
          sourceText: "",
          reasoning: `Extracted from individual lease document: ${src}`,
        });
      }
      
      // Also capture property info from leases
      if (data.property) {
        const p = data.property;
        recordField("propertyName", p.name, src);
        recordField("propertyAddress", p.address, src);
        recordField("city", p.city, src);
        recordField("propertyType", p.propertyType, src);
      }
    }

    if (doc.classifiedType === "tax_assessment") {
      recordField("assessedValue", data.assessedValue, src);
      recordField("propertyTax", data.propertyTax, src);
    }

    if (doc.classifiedType === "appraisal") {
      recordField("appraisedValue", data.appraisedValue, src);
      recordField("askingCapRate", data.capRate, src);
      recordField("noi", data.noi, src);
    }
  }

  // Resolve fields: pick best value, detect conflicts
  const fieldMapping: Record<string, keyof AcquisitionInputs> = {
    propertyName: "propertyName",
    propertyAddress: "propertyAddress",
    city: "city",
    propertyType: "propertyType",
    nraSF: "nraSF",
    landArea: "landArea",
    yearBuilt: "yearBuilt",
    floors: "floors",
    parking: "parking",
    askingPrice: "askingPrice",
    askingCapRate: "askingCapRate",
    baseRent: "baseRent",
    recoveryIncome: "recoveryIncome",
    parkingIncome: "parkingIncome",
    otherIncome: "otherIncome",
    vacancyRate: "vacancyRate",
    propertyTax: "propertyTax",
    insurance: "insurance",
    utilities: "utilities",
    repairsMaint: "repairsMaint",
    management: "management",
    admin: "admin",
    payroll: "payroll",
    marketing: "marketing",
    otherExpenses: "otherExpenses",
    totalExpenses: "totalExpenses",
    noi: "noi",
    assessedValue: "assessedValue",
    appraisedValue: "appraisedValue",
  };

  const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1 };

  for (const [field, values] of Object.entries(fieldValues)) {
    if (!values.length) continue;

    // Sort by confidence descending
    values.sort((a, b) => (confidenceRank[b.confidence] || 0) - (confidenceRank[a.confidence] || 0));
    const best = values[0];

    // Check for conflicts (numeric fields with >5% difference)
    if (values.length > 1 && typeof best.value === "number") {
      const numericValues = values.filter((v) => typeof v.value === "number") as { value: number; source: string; page: string; confidence: string }[];
      const hasConflict = numericValues.some((v) => {
        const diff = Math.abs(v.value - (best.value as number)) / Math.abs(best.value as number);
        return diff > 0.05;
      });
      if (hasConflict) {
        conflicts.push({
          field,
          values: numericValues.map((v) => ({
            value: v.value,
            source: `${v.source} page ${v.page}`,
            label: v.source,
          })),
          resolution: `Using highest-confidence value from ${best.source} (${best.confidence} confidence)`,
        });
      }
    }

    // Set the value
    const key = fieldMapping[field];
    if (key) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inputs as any)[key] = best.value;
    }

    auditTrail.push({
      field,
      value: String(best.value),
      sourceDoc: best.source,
      page: best.page,
      confidence: best.confidence as AuditEntry["confidence"],
      sourceText: "",
      reasoning: values.length > 1
        ? `Found in ${values.length} documents. Using ${best.source} (${best.confidence} confidence).`
        : `Found in ${best.source}.`,
    });
  }

  return { inputs, auditTrail, conflicts };
}

// ---------------------------------------------------------------------------
// Step 4: Apply defaults & cross-validate
// ---------------------------------------------------------------------------

function applyDefaults(
  inputs: Partial<AcquisitionInputs>,
  auditTrail: AuditEntry[],
  warnings: string[]
): void {
  const defaults: { field: keyof AcquisitionInputs; value: number; label: string }[] = [
    { field: "vacancyRate", value: 0.05, label: "Vacancy rate: 5%" },
    { field: "incomeGrowth", value: 0.02, label: "Income growth: 2%" },
    { field: "expenseGrowth", value: 0.02, label: "Expense growth: 2%" },
    { field: "propertyTaxGrowth", value: 0.03, label: "Property tax growth: 3%" },
    { field: "capexGrowth", value: 0.02, label: "CapEx growth: 2%" },
    { field: "managementPct", value: 0.03, label: "Management: 3% of EGI" },
    { field: "capitalReservesPSF", value: 0.25, label: "Capital reserves: $0.25/SF" },
    { field: "closingCostsPct", value: 0.02, label: "Closing costs: 2%" },
    { field: "sellingCostsPct", value: 0.02, label: "Selling costs: 2%" },
    { field: "analysisPeriod", value: 10, label: "Analysis period: 10 years" },
  ];

  for (const d of defaults) {
    if (inputs[d.field] === undefined || inputs[d.field] === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inputs as any)[d.field] = d.value;
      warnings.push(`${d.label} — using default (not found in documents)`);
      auditTrail.push({
        field: d.field,
        value: String(d.value),
        sourceDoc: "system",
        page: "N/A",
        confidence: "default",
        sourceText: "",
        reasoning: `Default value applied — not found in uploaded documents.`,
      });
    }
  }
}

function crossValidate(inputs: Partial<AcquisitionInputs>, warnings: string[], conflicts: ConflictEntry[]): void {
  // Rent roll total vs stated base rent
  if (inputs.tenants && inputs.baseRent) {
    const rrTotal = inputs.tenants.reduce((sum, t) => sum + (t.baseRentAnnual || 0), 0);
    if (rrTotal > 0 && inputs.baseRent > 0) {
      const diff = Math.abs(rrTotal - inputs.baseRent) / inputs.baseRent;
      if (diff > 0.05) {
        warnings.push(
          `Rent roll total ($${rrTotal.toLocaleString()}) differs from stated base rent ($${inputs.baseRent.toLocaleString()}) by ${(diff * 100).toFixed(1)}%`
        );
      }
    }
  }

  // NOI / Price ≈ cap rate
  if (inputs.noi && inputs.askingPrice && inputs.askingCapRate) {
    const impliedCap = inputs.noi / inputs.askingPrice;
    const diff = Math.abs(impliedCap - inputs.askingCapRate) / inputs.askingCapRate;
    if (diff > 0.1) {
      warnings.push(
        `Implied cap rate (${(impliedCap * 100).toFixed(2)}%) differs from stated cap rate (${(inputs.askingCapRate * 100).toFixed(2)}%) by ${(diff * 100).toFixed(1)}%`
      );
    }
  }

  // Revenue - expenses ≈ NOI
  if (inputs.baseRent && inputs.totalExpenses && inputs.noi) {
    const totalRevenue =
      (inputs.baseRent || 0) +
      (inputs.recoveryIncome || 0) +
      (inputs.parkingIncome || 0) +
      (inputs.otherIncome || 0);
    const effectiveRevenue = totalRevenue * (1 - (inputs.vacancyRate || 0.05));
    const impliedNOI = effectiveRevenue - inputs.totalExpenses;
    const diff = Math.abs(impliedNOI - inputs.noi) / inputs.noi;
    if (diff > 0.1) {
      warnings.push(
        `Computed NOI ($${impliedNOI.toLocaleString()}) differs from stated NOI ($${inputs.noi.toLocaleString()}) by ${(diff * 100).toFixed(1)}%`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function extractFromDocuments(
  documents: DocumentInput[]
): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const allTexts: { filename: string; text: string }[] = [];

  // Step 1: Extract text from each document
  for (const doc of documents) {
    try {
      const text = await extractText(doc.filePath);
      allTexts.push({ filename: doc.filename, text });
    } catch (err) {
      warnings.push(`Failed to read ${doc.filename}: ${(err as Error).message}`);
    }
  }

  if (!allTexts.length) {
    return {
      inputs: {},
      auditTrail: [],
      warnings: ["No documents could be read."],
      conflicts: [],
    };
  }

  // Step 2: Classify documents
  const preClassified: Record<string, string> = {};
  const needsClassification: { filename: string; text: string }[] = [];

  for (const doc of documents) {
    if (doc.docType) {
      preClassified[doc.filename] = doc.docType;
    } else {
      const textEntry = allTexts.find((t) => t.filename === doc.filename);
      if (textEntry) {
        // Scanned PDFs: classify by filename heuristics since we have no text
        if (textEntry.text.startsWith("[SCANNED_PDF:")) {
          const fn = textEntry.filename.toLowerCase();
          if (fn.includes("lease") || fn.includes("otl") || fn.includes("offer to")) {
            preClassified[doc.filename] = "lease_agreement";
          } else if (fn.includes("rent roll")) {
            preClassified[doc.filename] = "rent_roll";
          } else if (fn.includes("financ") || fn.includes("operating") || fn.includes("income")) {
            preClassified[doc.filename] = "operating_statement";
          } else if (fn.includes("apprais")) {
            preClassified[doc.filename] = "appraisal";
          } else if (fn.includes("tax") || fn.includes("assess")) {
            preClassified[doc.filename] = "tax_assessment";
          } else {
            // Default scanned docs — try to classify with first page vision
            preClassified[doc.filename] = "lease_agreement"; // most common upload type
            warnings.push(`Scanned PDF "${doc.filename}" classified as lease_agreement by default (no text for classification). Check if correct.`);
          }
        } else {
          needsClassification.push(textEntry);
        }
      }
    }
  }

  let classifications = { ...preClassified };
  if (needsClassification.length > 0) {
    try {
      const aiClassifications = await classifyDocuments(needsClassification);
      classifications = { ...classifications, ...aiClassifications };
    } catch (err) {
      warnings.push(`Document classification failed: ${(err as Error).message}. Treating all as offering memorandum.`);
      for (const d of needsClassification) classifications[d.filename] = "offering_memorandum";
    }
  }

  // Build classified docs
  const classifiedDocs: ClassifiedDoc[] = documents.map((doc) => ({
    ...doc,
    classifiedType: classifications[doc.filename] || "other",
    text: allTexts.find((t) => t.filename === doc.filename)?.text || "",
    confidence: "medium",
  }));

  // Step 3: Extract per document
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractions: { doc: ClassifiedDoc; data: any }[] = [];

  for (const doc of classifiedDocs) {
    if (!doc.text) {
      warnings.push(`Skipping ${doc.filename} — no text content`);
      continue;
    }
    
    try {
      // Handle scanned PDFs with vision
      if (doc.text.startsWith("[SCANNED_PDF:")) {
        const scannedPath = doc.text.match(/\[SCANNED_PDF:(.*)\]/)?.[1];
        if (!scannedPath) {
          warnings.push(`Could not find path for scanned PDF: ${doc.filename}`);
          continue;
        }
        
        try {
          const ocrText = await ocrPdfToText(scannedPath, 10);
          if (!ocrText || ocrText.length < 50) {
            warnings.push(`OCR could not extract readable text from ${doc.filename}`);
            continue;
          }
          
          // Replace the doc's text with OCR result and process normally
          doc.text = ocrText;
          const prompt = buildExtractionPrompt(doc.classifiedType, ocrText, doc.filename);
          const response = await callAI(prompt);
          const data = safeParseJSON(response);
          if (data) {
            extractions.push({ doc, data });
          } else {
            warnings.push(`Failed to parse AI response for scanned ${doc.filename}`);
          }
        } catch (err) {
          warnings.push(`OCR extraction failed for ${doc.filename}: ${(err as Error).message}`);
        }
        continue;
      }
      
      if (doc.text.startsWith("[Image file:")) {
        warnings.push(`Skipping ${doc.filename} — standalone image extraction not yet supported`);
        continue;
      }
      
      const prompt = buildExtractionPrompt(doc.classifiedType, doc.text, doc.filename);
      const response = await callAI(prompt);
      const data = safeParseJSON(response);
      if (data) {
        extractions.push({ doc, data });
      } else {
        warnings.push(`Failed to parse AI response for ${doc.filename}`);
      }
    } catch (err) {
      warnings.push(`Extraction failed for ${doc.filename}: ${(err as Error).message}`);
    }
  }

  // Step 4: Merge
  const { inputs, auditTrail, conflicts } = mergeExtractions(classifiedDocs, extractions);

  // Step 4b: If we built a rent roll from individual leases, compute aggregates
  if (inputs.tenants && inputs.tenants.length > 0) {
    const totalSF = inputs.tenants.reduce((sum, t) => sum + (t.sf || 0), 0);
    const totalRent = inputs.tenants.reduce((sum, t) => sum + (t.baseRentAnnual || 0), 0);
    
    if (totalSF > 0 && !inputs.nraSF) {
      inputs.nraSF = totalSF;
      auditTrail.push({
        field: "nraSF",
        value: String(totalSF),
        sourceDoc: "Computed from leases",
        page: "N/A",
        confidence: "high",
        sourceText: "",
        reasoning: `Sum of ${inputs.tenants.length} tenant spaces from uploaded leases.`,
      });
    }
    
    if (totalRent > 0 && !inputs.baseRent) {
      inputs.baseRent = totalRent;
      auditTrail.push({
        field: "baseRent",
        value: String(totalRent),
        sourceDoc: "Computed from leases",
        page: "N/A",
        confidence: "high",
        sourceText: "",
        reasoning: `Sum of ${inputs.tenants.length} tenant rents from uploaded leases.`,
      });
    }
    
    // Compute recovery income from tenants if available
    const totalRecovery = inputs.tenants.reduce((sum, t) => {
      if (t.recoveryPSF && t.sf) return sum + (t.recoveryPSF * t.sf);
      return sum;
    }, 0);
    if (totalRecovery > 0 && !inputs.recoveryIncome) {
      inputs.recoveryIncome = totalRecovery;
    }
  }

  // Step 5: Defaults
  applyDefaults(inputs, auditTrail, warnings);

  // Step 6: Cross-validate
  crossValidate(inputs, warnings, conflicts);

  return { inputs, auditTrail, warnings, conflicts };
}
