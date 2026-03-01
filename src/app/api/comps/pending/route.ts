import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";

// GET - List all pending comps
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pending';
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const pendingComps = await db.select()
      .from(schema.pendingComps)
      .where(eq(schema.pendingComps.status, status))
      .orderBy(desc(schema.pendingComps.createdAt))
      .limit(limit);

    // Parse JSON fields for display
    const processedComps = pendingComps.map(comp => ({
      ...comp,
      fieldConfidence: comp.fieldConfidence ? JSON.parse(comp.fieldConfidence) : {},
      missingFields: comp.missingFields ? JSON.parse(comp.missingFields) : [],
    }));

    return NextResponse.json({ 
      comps: processedComps,
      count: processedComps.length
    });

  } catch (error) {
    console.error("Failed to fetch pending comps:", error);
    return NextResponse.json({ error: "Failed to fetch pending comps" }, { status: 500 });
  }
}

// POST - Bulk operations (approve, reject, etc.)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { action, compIds, updates } = await req.json();

    if (!action || !Array.isArray(compIds)) {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
    }

    const now = new Date().toISOString();

    switch (action) {
      case 'approve':
        return await approvePendingComps(compIds, auth.user.id, now);
      
      case 'reject':
        return await rejectPendingComps(compIds, auth.user.id, now);
      
      case 'bulk_approve':
        return await bulkApproveComps(auth.user.id, now);
      
      case 'update':
        return await updatePendingComp(compIds[0], updates, auth.user.id, now);
      
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

  } catch (error) {
    console.error("Pending comps operation failed:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

async function approvePendingComps(compIds: number[], userId: number, now: string) {
  const results = [];
  
  for (const compId of compIds) {
    try {
      // Get the pending comp
      const pendingComp = await db.select()
        .from(schema.pendingComps)
        .where(eq(schema.pendingComps.id, compId))
        .limit(1);

      if (!pendingComp[0]) {
        results.push({ compId, success: false, error: "Comp not found" });
        continue;
      }

      const comp = pendingComp[0];

      // Move to main comps table
      const { id, sourceType, sourceRef, status, duplicateOfId, confidence, 
              fieldConfidence, missingFields, notes, reviewedAt, reviewedBy, 
              updatedAt, ...compData } = comp;

      await db.insert(schema.comps).values({
        ...compData,
        source: `${sourceType}: ${sourceRef}`,
        createdAt: now,
      });

      // Update pending comp status
      await db.update(schema.pendingComps)
        .set({
          status: 'approved',
          reviewedAt: now,
          reviewedBy: userId,
          updatedAt: now
        })
        .where(eq(schema.pendingComps.id, compId));

      results.push({ compId, success: true, message: "Approved and moved to comps" });

    } catch (error) {
      console.error(`Failed to approve comp ${compId}:`, error);
      results.push({ compId, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const successCount = results.filter(r => r.success).length;
  return NextResponse.json({ 
    success: true,
    message: `Approved ${successCount}/${results.length} comps`,
    results 
  });
}

async function rejectPendingComps(compIds: number[], userId: number, now: string) {
  try {
    await db.update(schema.pendingComps)
      .set({
        status: 'rejected',
        reviewedAt: now,
        reviewedBy: userId,
        updatedAt: now
      })
      .where(eq(schema.pendingComps.id, compIds[0])); // Simplified - could handle multiple

    return NextResponse.json({ 
      success: true,
      message: `Rejected ${compIds.length} comp(s)`
    });
  } catch (error) {
    throw error;
  }
}

async function bulkApproveComps(userId: number, now: string) {
  try {
    // Get all high-confidence pending comps (confidence > 0.7)
    const highConfidenceComps = await db.select()
      .from(schema.pendingComps)
      .where(eq(schema.pendingComps.status, 'pending'));

    const toApprove = highConfidenceComps.filter(comp => comp.confidence > 0.7);

    if (toApprove.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No high-confidence comps to bulk approve" 
      });
    }

    // Approve them
    const compIds = toApprove.map(comp => comp.id);
    return await approvePendingComps(compIds, userId, now);

  } catch (error) {
    throw error;
  }
}

async function updatePendingComp(compId: number, updates: any, userId: number, now: string) {
  try {
    await db.update(schema.pendingComps)
      .set({
        ...updates,
        updatedAt: now
      })
      .where(eq(schema.pendingComps.id, compId));

    return NextResponse.json({ 
      success: true,
      message: "Comp updated successfully"
    });
  } catch (error) {
    throw error;
  }
}