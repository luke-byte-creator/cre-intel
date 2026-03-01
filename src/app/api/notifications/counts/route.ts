import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and, count } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    // Count unreviewed email-generated drafts
    const emailDraftsResult = await db.select({ count: count() })
      .from(schema.documentDrafts)
      .where(
        and(
          eq(schema.documentDrafts.userId, auth.user.id),
          eq(schema.documentDrafts.status, "ready_for_review")
        )
      );

    // Count pending comps
    const pendingCompsResult = await db.select({ count: count() })
      .from(schema.pendingComps)
      .where(eq(schema.pendingComps.status, "pending"));

    const emailDraftsCount = emailDraftsResult[0]?.count || 0;
    const pendingCompsCount = pendingCompsResult[0]?.count || 0;

    return NextResponse.json({
      emailDrafts: emailDraftsCount,
      pendingComps: pendingCompsCount,
      totalNotifications: emailDraftsCount + pendingCompsCount
    });

  } catch (error) {
    console.error("Failed to fetch notification counts:", error);
    return NextResponse.json({ error: "Failed to fetch notification counts" }, { status: 500 });
  }
}