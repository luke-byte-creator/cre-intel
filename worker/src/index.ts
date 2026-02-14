export interface Env {
  INGEST_URL: string;
  INGEST_SECRET: string;
}

interface ParsedFields {
  tenantName: string | null;
  tenantCompany: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  propertyOfInterest: string | null;
  businessDescription: string | null;
  spaceNeedsSf: string | null;
  notes: string | null;
}

function extractTextFromEmail(rawEmail: string): string {
  // Try to find text/plain boundary
  const boundaryMatch = rawEmail.match(/boundary="?([^"\r\n]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = rawEmail.split(`--${boundary}`);
    for (const part of parts) {
      if (part.includes("Content-Type: text/plain")) {
        const bodyStart = part.indexOf("\r\n\r\n") || part.indexOf("\n\n");
        if (bodyStart !== -1) {
          return part.slice(bodyStart + (part.includes("\r\n\r\n") ? 4 : 2)).trim();
        }
      }
    }
  }

  // Strip HTML tags if present
  let text = rawEmail.replace(/<[^>]+>/g, " ");

  // Remove email headers if it looks like raw email
  const headerEnd = text.search(/\n\n|\r\n\r\n/);
  if (headerEnd > 0 && headerEnd < 2000 && text.slice(0, headerEnd).includes("From:")) {
    text = text.slice(headerEnd + 2);
  }

  // Clean up whitespace
  return text.replace(/\s+/g, " ").trim();
}

function detectSource(from: string, subject: string, _body: string): "spacelist" | "cbre" | "unknown" {
  const lower = `${from} ${subject}`.toLowerCase();
  if (lower.includes("spacelist")) return "spacelist";
  if (lower.includes("cbre")) return "cbre";
  return "unknown";
}

function parseSpacelist(body: string): ParsedFields {
  // Spacelist format:
  // Address: Main Floor Retail - 906 Broadway Avenue
  // Name: jordan virador
  // Phone: 6394711195
  // Email: shoparmscye@gmail.com
  // Desired Location: Saskatoon, Saskatchewan
  // Space Type: retail
  // Square Footage: 1000
  // Transaction Type: lease
  // Message: ...
  const field = (key: string) => {
    const m = body.match(new RegExp(`${key}:\\s*(.+)`, "i"));
    return m?.[1]?.trim() || null;
  };

  const address = field("Address");
  const message = body.match(/Message:\s*([\s\S]*?)(?:View tenant|Reply to this|Upgrade to|$)/i)?.[1]?.trim() || null;

  // Build business description from available fields
  const spaceType = field("Space Type");
  const txType = field("Transaction Type");
  const moveIn = field("Desired Move in Date");
  const employees = field("Employees");
  const leaseLength = field("Desired Lease Length");
  const budget = field("Monthly Budget");
  const reason = field("Reason for Space");

  const descParts: string[] = [];
  if (spaceType) descParts.push(`Space type: ${spaceType}`);
  if (txType) descParts.push(`Transaction: ${txType}`);
  if (reason) descParts.push(`Reason: ${reason}`);
  if (employees) descParts.push(`Employees: ${employees}`);
  if (leaseLength) descParts.push(`Lease length: ${leaseLength}`);
  if (budget) descParts.push(`Budget: ${budget}`);
  if (moveIn) descParts.push(`Move-in: ${moveIn}`);

  return {
    tenantName: field("Name"),
    tenantCompany: null,
    tenantEmail: field("Email"),
    tenantPhone: field("Phone"),
    propertyOfInterest: address,
    businessDescription: descParts.length > 0 ? descParts.join(". ") : null,
    spaceNeedsSf: field("Square Footage") ? `${field("Square Footage")} sf` : null,
    notes: message,
  };
}

function parseCBRE(body: string): ParsedFields {
  // CBRE format is similar but with fewer fields
  // Try the same key:value pattern
  const field = (key: string) => {
    const m = body.match(new RegExp(`${key}:\\s*(.+)`, "i"));
    return m?.[1]?.trim() || null;
  };

  const emailMatch = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneMatch = body.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);

  return {
    tenantName: field("Name") || field("Contact"),
    tenantCompany: field("Company") || field("Organization"),
    tenantEmail: field("Email") || emailMatch?.[0] || null,
    tenantPhone: field("Phone") || phoneMatch?.[0] || null,
    propertyOfInterest: field("Address") || field("Property"),
    businessDescription: field("Space Type") || field("Type"),
    spaceNeedsSf: field("Square Footage") || field("Size"),
    notes: field("Message") || field("Comments"),
  };
}

function parseGeneric(body: string): ParsedFields {
  const emailMatch = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneMatch = body.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  const nameMatch = body.match(/(?:Name|Contact|Tenant):\s*(.+)/i);
  const companyMatch = body.match(/(?:Company|Organization|Business):\s*(.+)/i);
  const spaceMatch = body.match(/([\d,]+)\s*(?:sf|sq\.?\s*ft|square\s*feet)/i);
  const addressMatch = body.match(/\d+\s+[\w\s]+(?:St|Ave|Blvd|Dr|Rd|Way|Cres|Lane|Pl|Ct)[\w\s.]*/i);

  return {
    tenantName: nameMatch?.[1]?.trim() || null,
    tenantCompany: companyMatch?.[1]?.trim() || null,
    tenantEmail: emailMatch?.[0] || null,
    tenantPhone: phoneMatch?.[0] || null,
    propertyOfInterest: addressMatch?.[0]?.trim() || null,
    businessDescription: null,
    spaceNeedsSf: spaceMatch ? `${spaceMatch[1]} sf` : null,
    notes: null,
  };
}

function parseEmail(source: string, body: string, _subject: string): ParsedFields {
  if (source === "spacelist") return parseSpacelist(body);
  if (source === "cbre") return parseCBRE(body);
  return parseGeneric(body);
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const rawEmail = await new Response(message.raw).text();
    const textContent = extractTextFromEmail(rawEmail);
    const from = message.from;
    const subject = message.headers.get("subject") || "";

    const source = detectSource(from, subject, textContent);
    const parsed = parseEmail(source, textContent, subject);

    await fetch(env.INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.INGEST_SECRET,
        rawEmail: textContent,
        from,
        subject,
        source,
        parsed,
      }),
    });
  },
};
