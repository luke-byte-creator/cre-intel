import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [companies] = db.select({ count: sql<number>`count(*)` }).from(schema.companies).all();
  const [people] = db.select({ count: sql<number>`count(*)` }).from(schema.people).all();
  const [properties] = db.select({ count: sql<number>`count(*)` }).from(schema.properties).all();
  const [transactions] = db.select({ count: sql<number>`count(*)` }).from(schema.transactions).all();
  const [permits] = db.select({ count: sql<number>`count(*)` }).from(schema.permits).all();
  const [watchlist] = db.select({ count: sql<number>`count(*)` }).from(schema.watchlist).all();
  const [unreadAlerts] = db.select({ count: sql<number>`count(*)` }).from(schema.alertsLog).where(sql`is_read = 0`).all();

  const recentTransactions = db
    .select()
    .from(schema.transactions)
    .orderBy(sql`transfer_date DESC`)
    .limit(5)
    .all();

  const recentPermits = db
    .select()
    .from(schema.permits)
    .orderBy(sql`issue_date DESC`)
    .limit(5)
    .all();

  const recentAlerts = db
    .select()
    .from(schema.alertsLog)
    .orderBy(sql`created_at DESC`)
    .limit(10)
    .all();

  const totalTransactionValue = db
    .select({ total: sql<number>`COALESCE(SUM(price), 0)` })
    .from(schema.transactions)
    .all()[0];

  const totalPermitValue = db
    .select({ total: sql<number>`COALESCE(SUM(estimated_value), 0)` })
    .from(schema.permits)
    .all()[0];

  return NextResponse.json({
    counts: {
      companies: companies.count,
      people: people.count,
      properties: properties.count,
      transactions: transactions.count,
      permits: permits.count,
      watchlist: watchlist.count,
      unreadAlerts: unreadAlerts.count,
    },
    totals: {
      transactionValue: totalTransactionValue.total,
      permitValue: totalPermitValue.total,
    },
    recentTransactions,
    recentPermits,
    recentAlerts,
  });
}
