import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
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

  // Get the analysis record
  const rows = await db.select().from(schema.underwritingAnalyses)
    .where(eq(schema.underwritingAnalyses.id, Number(id)))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const analysis = rows[0];
  const originalInputs = analysis.inputs || "{}";

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const context = formData.get("context") as string | null;
  const finalInputsRaw = formData.get("finalInputs") as string | null;

  if (!context && !file && !finalInputsRaw) {
    return NextResponse.json({ error: "Provide at least context or a file" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let finalDocPath: string | null = null;
  let extractedText = "";

  // Save uploaded file if present
  if (file && file.size > 0) {
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }
    const dir = path.join(process.cwd(), "data", "underwriting");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(file.name) || ".xlsx";
    const filename = `final_${id}_${Date.now()}${ext}`;
    finalDocPath = path.join(dir, filename);
    const bytes = new Uint8Array(await file.arrayBuffer());
    fs.writeFileSync(finalDocPath, bytes);

    try {
      extractedText = await extractTextFromFile(finalDocPath, file.type);
    } catch {
      extractedText = "";
    }
  }

  // Build the final inputs reference (extracted text or pasted JSON)
  const finalReference = finalInputsRaw || extractedText;

  // Generate diff summary — focused on structural/layout changes
  const diffResponse = await callAI([
    {
      role: "system",
      content: `You are a CRE underwriting analyst comparing an AI-generated model with the final version a team actually used. Focus on STRUCTURAL changes — how the model is built, not specific number changes.

Return ONLY valid JSON:
{
  "overallSimilarity": 0.0-1.0,
  "summary": "Brief summary of structural/layout/format changes",
  "changes": [
    { "type": "added|removed|modified", "section": "section name", "description": "what structural change was made" }
  ],
  "structuralPatterns": ["Patterns about HOW the model should be built, e.g. 'Added three cap rate scenarios side by side', 'Broke out recovery income by type', 'Added debt coverage ratio row'"],
  "numberChanges": "Brief note of assumption changes (for context only, not for learning)"
}

Focus on: sections added/removed, metrics included/excluded, layout changes, presentation format, scenario structures, line item granularity. Number-specific changes (cap rate values, vacancy percentages) are noted briefly but are NOT the focus.`,
    },
    {
      role: "user",
      content: `Asset class: ${analysis.assetClass}
Property: ${analysis.propertyAddress || analysis.name}

ORIGINAL INPUTS (AI-generated):
${originalInputs.slice(0, 8000)}

${finalReference ? `FINAL VERSION / CORRECTED INPUTS:\n${finalReference.slice(0, 8000)}` : "(No final inputs provided)"}

USER'S EXPLANATION OF CHANGES:
${context || "(No explanation provided)"}`,
    },
  ]);

  let diffSummary = diffResponse;
  try {
    const match = diffResponse.match(/\{[\s\S]*\}/);
    if (match) { JSON.parse(match[0]); diffSummary = match[0]; }
  } catch { /* use raw */ }

  // Extract firm-wide preference observations
  // Preference learning is silently gated to primary underwriters
  const PREF_LEARNERS = ["luke.jansen@cbre.com", "dallon.kuprowski@cbre.com", "ben.kelley@cbre.com"];
  const canInfluencePrefs = PREF_LEARNERS.includes(auth.user.email?.toLowerCase() ?? "");
  try {
    const prefResponse = await callAI([
      {
        role: "system",
        content: `You are analyzing changes between an AI-generated underwriting model and the final version a CRE team used. Extract STRUCTURAL preferences — how the model should be built, formatted, and presented.

IMPORTANT: Focus ONLY on structural/formatting/layout preferences. Do NOT extract number-specific preferences like "cap rate should be X%" or "vacancy should be Y%". We want to learn HOW models should be built, not what numbers to use.

Return ONLY valid JSON array:
[
  {
    "assetClass": "industrial|office|retail|multifamily|mixed",
    "submarket": "optional geographic qualifier or null",
    "observation": "Structural preference, e.g. 'Always show three cap rate scenarios side by side', 'Break out property tax from operating costs', 'Include debt coverage ratio row', 'Show $/SF and $/unit and total on summary'",
    "confidence": 0.5-0.9
  }
]

Good observations: layout, sections, metrics to include/exclude, scenario structures, line item granularity, presentation format.
Bad observations (DO NOT include): specific numbers, rates, percentages, dollar amounts.
Max 5 observations.`,
      },
      {
        role: "user",
        content: `Asset class: ${analysis.assetClass}
Property: ${analysis.propertyAddress || analysis.name}

Diff summary: ${diffSummary}

User's explanation: ${context || "(none)"}`,
      },
    ], 2000);

    const match = prefResponse.match(/\[[\s\S]*\]/);
    if (match && canInfluencePrefs) {
      const observations: { assetClass: string; submarket?: string; observation: string; confidence: number }[] = JSON.parse(match[0]);
      for (const obs of observations) {
        // Check for existing similar observation
        const existing = await db.select().from(schema.underwritingStructurePrefs)
          .where(eq(schema.underwritingStructurePrefs.assetClass, obs.assetClass))
          .all();

        const similar = existing.find(e => e.observation === obs.observation);

        if (similar) {
          const sourceIds: number[] = similar.sourceAnalysisIds ? JSON.parse(similar.sourceAnalysisIds) : [];
          if (!sourceIds.includes(Number(id))) sourceIds.push(Number(id));
          await db.update(schema.underwritingStructurePrefs).set({
            occurrences: similar.occurrences + 1,
            confidence: Math.min(1, similar.confidence + 0.1),
            lastSeenAt: now,
            sourceAnalysisIds: JSON.stringify(sourceIds),
          }).where(eq(schema.underwritingStructurePrefs.id, similar.id));
        } else {
          await db.insert(schema.underwritingStructurePrefs).values({
            assetClass: obs.assetClass,
            submarket: obs.submarket || null,
            observation: obs.observation,
            confidence: obs.confidence || 0.5,
            occurrences: 1,
            sourceAnalysisIds: JSON.stringify([Number(id)]),
            lastSeenAt: now,
            createdAt: now,
          });
        }
      }
    }
  } catch {
    // Non-critical
  }

  // Update the analysis record
  await db.update(schema.underwritingAnalyses).set({
    finalDocPath,
    finalInputs: finalInputsRaw || null,
    feedbackContext: context || null,
    diffSummary,
    uploadedAt: now,
    updatedAt: now,
  }).where(eq(schema.underwritingAnalyses.id, Number(id)));

  // Track activity
  try {
    await db.insert(schema.activityEvents).values({
      userId: auth.user.id,
      userName: auth.user.name,
      action: "underwriting_feedback",
      category: "underwriting",
      detail: JSON.stringify({ analysisId: Number(id), hasFile: !!file, hasContext: !!context }),
      path: `/underwrite`,
      createdAt: now,
    });
  } catch { /* non-critical */ }

  return NextResponse.json({ success: true, diffSummary });
}
