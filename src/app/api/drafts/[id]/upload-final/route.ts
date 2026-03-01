import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { extractTextFromFile } from "@/lib/extract-text";
import { callAI } from "@/lib/ai";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  // Get the draft
  const draft = await db.select().from(schema.documentDrafts)
    .where(and(eq(schema.documentDrafts.id, Number(id)), eq(schema.documentDrafts.userId, auth.user.id)))
    .limit(1);

  if (!draft[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!draft[0].generatedContent) return NextResponse.json({ error: "Draft has no generated content" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

  // Save file
  const draftsDir = path.join(process.cwd(), "data", "drafts");
  if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });

  const ext = path.extname(file.name) || ".txt";
  const filename = `final_${auth.user.id}_${Date.now()}${ext}`;
  const filePath = path.join(draftsDir, filename);
  const bytes = new Uint8Array(await file.arrayBuffer());
  fs.writeFileSync(filePath, bytes);

  // Extract text
  const finalText = await extractTextFromFile(filePath, file.type);

  // Generate diff summary
  const diffResponse = await callAI([
    {
      role: "system",
      content: `You are a document comparison expert. Compare the original AI-generated draft with the final version the user actually used. Return a structured JSON diff summary. Focus on:
1. Sections added, removed, or significantly modified
2. Language/tone changes
3. Specific clauses or terms that were altered
4. Overall structural changes

Return ONLY valid JSON:
{
  "overallSimilarity": 0.0-1.0,
  "summary": "Brief natural language summary of changes",
  "changes": [
    { "type": "added|removed|modified", "section": "section name", "description": "what changed" }
  ],
  "toneShift": "description of any tone/formality changes or null",
  "keyTermChanges": ["list of specific terms/clauses that were changed"]
}`,
    },
    {
      role: "user",
      content: `ORIGINAL DRAFT:\n${draft[0].generatedContent.slice(0, 10000)}\n\n---\n\nFINAL VERSION:\n${finalText.slice(0, 10000)}`,
    },
  ]);

  let diffSummary = diffResponse;
  try {
    const match = diffResponse.match(/\{[\s\S]*\}/);
    if (match) { JSON.parse(match[0]); diffSummary = match[0]; }
  } catch {}

  // Update draft
  const now = new Date().toISOString();
  await db.update(schema.documentDrafts).set({
    finalDocPath: filePath,
    finalContent: finalText,
    diffSummary,
    uploadedAt: now,
    updatedAt: now,
  }).where(eq(schema.documentDrafts.id, Number(id)));

  // Extract preference observations
  try {
    const prefResponse = await callAI([
      {
        role: "system",
        content: `You are analyzing changes between an AI-generated document draft and the final version a user submitted. Extract preference observations — patterns about what this user prefers in their ${draft[0].documentType} documents.

Return ONLY valid JSON array:
[
  { "observation": "User prefers shorter introductory paragraphs", "confidence": 0.7 },
  { "observation": "User adds specific legal jurisdiction references", "confidence": 0.8 }
]

Keep observations actionable and specific. Max 5 observations.`,
      },
      {
        role: "user",
        content: `Document type: ${draft[0].documentType}\n\nDiff summary: ${diffSummary}\n\nOriginal (first 3000 chars):\n${draft[0].generatedContent.slice(0, 3000)}\n\nFinal (first 3000 chars):\n${finalText.slice(0, 3000)}`,
      },
    ], 2000);

    const match = prefResponse.match(/\[[\s\S]*\]/);
    if (match) {
      const observations: { observation: string; confidence: number }[] = JSON.parse(match[0]);
      for (const obs of observations) {
        // Check for existing similar observation
        const existing = await db.select().from(schema.draftPreferences)
          .where(and(
            eq(schema.draftPreferences.userId, auth.user.id),
            eq(schema.draftPreferences.documentType, draft[0].documentType),
            eq(schema.draftPreferences.observation, obs.observation),
          )).limit(1);

        if (existing[0]) {
          await db.update(schema.draftPreferences).set({
            occurrences: existing[0].occurrences + 1,
            confidence: Math.min(1, existing[0].confidence + 0.1),
            lastSeenAt: now,
          }).where(eq(schema.draftPreferences.id, existing[0].id));
        } else {
          await db.insert(schema.draftPreferences).values({
            userId: auth.user.id,
            documentType: draft[0].documentType,
            observation: obs.observation,
            confidence: obs.confidence || 0.5,
            occurrences: 1,
            lastSeenAt: now,
            createdAt: now,
          });
        }
      }
    }
  } catch {
    // Non-critical — don't fail the upload
  }

  return NextResponse.json({ success: true, diffSummary });
}
