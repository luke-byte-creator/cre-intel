import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";

function getGatewayConfig(): { url: string; token: string } {
  // Read from OpenClaw config
  try {
    const configPath = path.join(process.env.HOME || "", ".openclaw/openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const port = config.gateway?.port || 18789;
    const token = config.gateway?.auth?.token || "";
    return { url: `http://127.0.0.1:${port}/v1/chat/completions`, token };
  } catch {}
  throw new Error("Could not read OpenClaw gateway config");
}

function parseComments(notes: string | null): { text: string; date: string }[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return notes ? [{ text: notes, date: "" }] : [];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  let body: { instructions?: string; recipientEmail?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.instructions) {
    return NextResponse.json({ error: "instructions required" }, { status: 400 });
  }

  const deals = await db.select().from(schema.deals).where(eq(schema.deals.id, Number(id)));
  if (!deals.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deal = deals[0];

  const comments = parseComments(deal.notes);
  const recentNotes = comments.slice(-3).map(c => c.text).join("\n- ") || "None";

  // Parse deal economics if available
  let economicsContext = "";
  if (deal.dealEconomics) {
    try {
      const econ = JSON.parse(deal.dealEconomics as string);
      const inp = econ.inputs || {};
      const res = econ.results || {};
      const parts: string[] = [];
      if (inp.sf) parts.push(`Size: ${inp.sf} SF`);
      if (inp.startDate) parts.push(`Start Date: ${inp.startDate}`);
      if (inp.baseRent) parts.push(`Base Rent: $${inp.baseRent}/SF/year`);
      if (inp.term) parts.push(`Term: ${inp.term} months`);
      if (inp.freeRent && Number(inp.freeRent) > 0) parts.push(`Free Rent: ${inp.freeRent} months`);
      if (inp.ti && Number(inp.ti) > 0) parts.push(`TI Allowance: $${inp.ti}/SF`);
      if (inp.otherExpense && Number(inp.otherExpense) > 0) parts.push(`Other Expenses: $${inp.otherExpense}/SF`);
      if (inp.rentSteps?.length) {
        const steps = inp.rentSteps.map((s: { month: string; rent: string }) => `Month ${s.month}: $${s.rent}/SF`).join(", ");
        parts.push(`Rent Steps: ${steps}`);
      }
      if (res.totalRent) parts.push(`Total Rent: $${res.totalRent.toLocaleString()}`);
      if (res.nerYear) parts.push(`Net Effective Rent: $${res.nerYear.toFixed(2)}/SF/year`);
      if (parts.length) {
        economicsContext = `\n\nDeal Economics (use these numbers if relevant to the email — do NOT make up numbers):\n- ${parts.join("\n- ")}`;
      }
    } catch {}
  }

  const prompt = `You are writing a professional email for a commercial real estate agent.

Context about this deal:
- Tenant/Company: ${deal.tenantName}${deal.tenantCompany ? ` (${deal.tenantCompany})` : ""}
- Property: ${deal.propertyAddress}
- Recent notes:
- ${recentNotes}${economicsContext}

IMPORTANT: Only reference deal terms/numbers that are provided above. NEVER invent or hallucinate numbers, rates, dates, or terms that aren't in the context.

The agent's instructions for this email:
${body.instructions}

Write a concise, natural email. Keep the tone casual-professional — like texting a business contact you've worked with before. No corporate jargon, no "I hope this email finds you well," no "please do not hesitate." Just get to the point in a friendly way. Sign off with just "Best," (the agent will add their own name).

Return your response in this exact format:
SUBJECT: <subject line>
---
<email body>`;

  let gateway: { url: string; token: string };
  try { gateway = getGatewayConfig(); } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const response = await fetch(gateway.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${gateway.token}`,
    },
    body: JSON.stringify({
      model: "openclaw:main",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: `Email generation failed: ${err}` }, { status: 502 });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  // Parse SUBJECT: ... --- ... body
  let subject = "";
  let emailBody = text;
  const match = text.match(/^SUBJECT:\s*(.+?)\n---\n([\s\S]*)$/m);
  if (match) {
    subject = match[1].trim();
    emailBody = match[2].trim();
  }

  const recipientEmail = body.recipientEmail || deal.tenantEmail || "";

  return NextResponse.json({ subject, body: emailBody, recipientEmail });
}
