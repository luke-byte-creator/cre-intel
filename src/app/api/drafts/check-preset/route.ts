import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";

function getGatewayConfig() {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return { port: config.gateway?.port || 18789, token: config.gateway?.auth?.token || "" };
}

async function callAI(messages: { role: string; content: string }[]) {
  const { port, token } = getGatewayConfig();
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: "anthropic/claude-sonnet-4-20250514", messages, max_tokens: 4000 }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const documentType = body.documentType as string;
  if (!documentType) return NextResponse.json({ error: "documentType required" }, { status: 400 });

  // Get user's drafts of this type that have extractedStructure
  const drafts = await db.select().from(schema.documentDrafts)
    .where(and(
      eq(schema.documentDrafts.userId, auth.user.id),
      eq(schema.documentDrafts.documentType, documentType),
    ));

  const withStructure = drafts.filter(d => d.extractedStructure);
  if (withStructure.length < 3) {
    return NextResponse.json({ suggest: false, count: withStructure.length });
  }

  // Check if user already has a preset for this type
  const existingPresets = await db.select().from(schema.documentPresets)
    .where(and(
      eq(schema.documentPresets.userId, auth.user.id),
      eq(schema.documentPresets.documentType, documentType),
    ));

  if (existingPresets.length > 0) {
    return NextResponse.json({ suggest: false, reason: "preset_exists" });
  }

  // Ask AI to compare and merge structures
  const structures = withStructure.slice(0, 5).map((d, i) => `Document ${i + 1}:\n${d.extractedStructure}`).join("\n\n---\n\n");

  const aiResponse = await callAI([
    {
      role: "system",
      content: `You analyze commercial real estate document structures. Compare the provided structures and determine if they're similar enough to create a reusable preset/template. Return JSON:
{
  "similar_enough": true/false,
  "confidence": 0.0-1.0,
  "merged_structure": { ...the merged/averaged structure if similar... },
  "summary": "Brief description of what this preset captures"
}`,
    },
    { role: "user", content: `Compare these ${withStructure.length} document structures:\n\n${structures}` },
  ]);

  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
    return NextResponse.json({
      suggest: parsed.similar_enough,
      count: withStructure.length,
      mergedStructure: parsed.merged_structure,
      summary: parsed.summary,
      confidence: parsed.confidence,
    });
  } catch {
    return NextResponse.json({ suggest: false, error: "Could not analyze structures" });
  }
}
