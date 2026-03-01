import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { callAI } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { comp, type, missingFields } = body;

  if (!comp || !type) {
    return NextResponse.json({ error: "comp and type required" }, { status: 400 });
  }

  const fieldLabels: Record<string, string> = {
    propertyType: "property type",
    saleDate: "sale date",
    salePrice: "sale price",
    areaSF: "building size (SF)",
    landAcres: "land size (acres)",
    seller: "vendor/seller name",
    purchaser: "purchaser name",
    tenant: "tenant name",
    landlord: "landlord name",
    leaseStart: "lease commencement date",
    leaseExpiry: "lease expiry date",
    netRentPSF: "net rent per SF",
    annualRent: "annual rent",
    capRate: "cap rate",
    noi: "NOI",
    yearBuilt: "year built",
    zoning: "zoning",
    constructionClass: "construction class",
    termMonths: "lease term",
    operatingCost: "operating costs per SF",
    numUnits: "number of units",
  };

  const missingLabels = (missingFields || [])
    .map((f: string) => fieldLabels[f] || f)
    .filter(Boolean);

  const compSummary = type === "Sale"
    ? `${comp.address}${comp.city ? ", " + comp.city : ""} — Sale${comp.saleDate ? " on " + comp.saleDate : ""}${comp.salePrice ? " for $" + Number(comp.salePrice).toLocaleString() : ""}${comp.seller ? " (vendor: " + comp.seller + ")" : ""}${comp.purchaser ? " (purchaser: " + comp.purchaser + ")" : ""}`
    : `${comp.address}${comp.city ? ", " + comp.city : ""} — Lease${comp.tenant ? " to " + comp.tenant : ""}${comp.landlord ? " from " + comp.landlord : ""}${comp.leaseStart ? " starting " + comp.leaseStart : ""}`;

  const prompt = `You are a commercial real estate broker writing a quick email requesting additional details about a transaction. Keep it to 3-4 sentences max. Be direct and specific about what you need. Casual-professional tone — no corporate fluff, no "I hope this finds you well." Write like you're emailing a colleague you've worked with before.

TRANSACTION:
${compSummary}
Property type: ${comp.propertyType || "unknown"}
${comp.areaSF ? "Size: " + Number(comp.areaSF).toLocaleString() + " SF" : ""}

MISSING INFORMATION WE NEED:
${missingLabels.length > 0 ? missingLabels.map((l: string) => "- " + l).join("\n") : "- General transaction details"}

Generate an email with:
- subject: Brief, professional subject line
- body: Professional email body. Don't include greeting name (user will add that). Start with context about the transaction, then ask for the specific missing details. Sign off generically (user will add their signature).

Return as JSON only: {"subject": "...", "body": "..."}
No markdown fences.`;

  try {
    const response = await callAI([
      { role: "system", content: prompt },
      { role: "user", content: "Generate the email." },
    ], 1000);

    const cleaned = response.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({ subject: parsed.subject, body: parsed.body });
  } catch {
    return NextResponse.json({ error: "Failed to generate email" }, { status: 500 });
  }
}
