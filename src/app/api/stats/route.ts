import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const [companies] = db.select({ count: sql<number>`count(*)` }).from(schema.companies).all();
  const [people] = db.select({ count: sql<number>`count(*)` }).from(schema.people).all();
  const [properties] = db.select({ count: sql<number>`count(*)` }).from(schema.properties).all();
  const [transactions] = db.select({ count: sql<number>`count(*)` }).from(schema.transactions).where(sql`transfer_date >= date((SELECT MAX(transfer_date) FROM transactions), '-3 months')`).all();
  const [permits] = db.select({ count: sql<number>`count(*)` }).from(schema.permits).all();
  const [watchlistCount] = db.select({ count: sql<number>`count(*)` }).from(schema.watchlist).all();
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
    .where(sql`transfer_date >= date((SELECT MAX(transfer_date) FROM transactions), '-3 months')`)
    .all()[0];

  const totalPermitValue = db
    .select({ total: sql<number>`COALESCE(SUM(estimated_value), 0)` })
    .from(schema.permits)
    .where(sql`issue_date >= date((SELECT MAX(issue_date) FROM permits), '-3 months')`)
    .all()[0];

  // Monthly aggregations via raw SQL expressions through drizzle
  const monthlyTransactions = db.all<{ month: string; count: number; volume: number }>(
    sql`SELECT strftime('%Y-%m', transfer_date) as month,
           COUNT(*) as count,
           COALESCE(SUM(price), 0) as volume
    FROM transactions
    GROUP BY strftime('%Y-%m', transfer_date)
    ORDER BY month DESC
    LIMIT 3`
  );

  const monthlyPermits = db.all<{ month: string; count: number; value: number }>(
    sql`SELECT strftime('%Y-%m', issue_date) as month,
           COUNT(*) as count,
           COALESCE(SUM(estimated_value), 0) as value
    FROM permits
    GROUP BY strftime('%Y-%m', issue_date)
    ORDER BY month DESC
    LIMIT 3`
  );

  return NextResponse.json({
    counts: {
      companies: companies.count,
      people: people.count,
      properties: properties.count,
      transactions: transactions.count,
      permits: permits.count,
      watchlist: watchlistCount.count,
      unreadAlerts: unreadAlerts.count,
    },
    totals: {
      transactionValue: totalTransactionValue.total,
      permitValue: totalPermitValue.total,
    },
    recentTransactions,
    recentPermits,
    recentAlerts,
    monthlyTransactions,
    monthlyPermits,
  });
}
