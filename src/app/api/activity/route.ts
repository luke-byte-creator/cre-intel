import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  // Pull recent credit_ledger entries (primary activity source)
  const ledgerActivities = db
    .select({
      id: schema.creditLedger.id,
      userId: schema.creditLedger.userId,
      userName: schema.users.name,
      reason: schema.creditLedger.reason,
      amount: schema.creditLedger.amount,
      compId: schema.creditLedger.compId,
      metadata: schema.creditLedger.metadata,
      description: schema.creditLedger.description,
      createdAt: schema.creditLedger.createdAt,
    })
    .from(schema.creditLedger)
    .innerJoin(schema.users, sql`${schema.creditLedger.userId} = ${schema.users.id}`)
    .where(sql`${schema.creditLedger.reason} != 'daily_decay'`)
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(30)
    .all();

  const activities = ledgerActivities.map((entry) => {
    let meta: { entityType?: string } = {};
    try { if (entry.metadata) meta = JSON.parse(entry.metadata); } catch {}

    const entityType = meta.entityType || null;
    const entityId = entry.compId || null;

    // Use stored description if available, fall back to formatted reason
    let description: string;
    if (entry.description) {
      description = entry.description;
    } else {
      const reason = entry.reason.replace(/_/g, " ");
      description = reason.charAt(0).toUpperCase() + reason.slice(1);
    }

    // Build link
    let link: string | null = null;
    if (entityType && entityId) {
      const typeMap: Record<string, string> = {
        company: "/companies/",
        person: "/people/",
        property: "/properties/",
        comp: "/transactions",
        sale: "/sales",
        lease: "/leases",
        inquiry: "/inquiries",
        deal: "/pipeline",
      };
      const prefix = typeMap[entityType];
      if (prefix && !prefix.endsWith("/")) {
        link = prefix;
      } else if (prefix) {
        link = `${prefix}${entityId}`;
      }
    }

    return {
      id: `ledger-${entry.id}`,
      type: entityType || "contribution",
      description,
      userName: entry.userName,
      timestamp: entry.createdAt,
      entityType,
      entityId,
      link,
    };
  });

  return NextResponse.json({ activities });
}
