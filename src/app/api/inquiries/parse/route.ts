import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";

function getGatewayConfig(): { url: string; token: string } {
  try {
    const configPath = path.join(process.env.HOME || "", ".openclaw/openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const port = config.gateway?.port || 18789;
    const token = config.gateway?.auth?.token || "";
    return { url: `http://127.0.0.1:${port}/v1/chat/completions`, token };
  } catch {}
  throw new Error("Could not read OpenClaw gateway config");
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: { text: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.text || body.text.trim().length < 10) {
    return NextResponse.json({ error: "Paste email text (at least 10 characters)" }, { status: 400 });
  }

  const { url, token } = getGatewayConfig();

  const systemPrompt = `You extract structured inquiry data from email text. Return ONLY valid JSON with these fields (use null for missing):
{
  "tenantName": "person's full name",
  "tenantCompany": "company name or null",
  "tenantEmail": "email address or null",
  "tenantPhone": "phone number or null",
  "propertyOfInterest": "property/location mentioned or null",
  "businessDescription": "what they do / what they need space for, or null",
  "spaceNeedsSf": "space requirements (e.g. '5,000 SF') or null",
  "timeline": "when they need space (e.g. 'Q2 2026') or null",
  "notes": "any other relevant details not captured above, or null"
}
Be concise. Extract what's there, don't invent.`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: body.text.slice(0, 5000) },
        ],
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI parse failed: ${err}` }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse AI response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Parse failed: ${msg}` }, { status: 500 });
  }
}
