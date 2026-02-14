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
  const [salesCount] = db.select({ count: sql<number>`count(*)` }).from(schema.comps).where(sql`type = 'Sale'`).all();
  const [leasesCount] = db.select({ count: sql<number>`count(*)` }).from(schema.comps).where(sql`type = 'Lease'`).all();
  const [permits] = db.select({ count: sql<number>`count(*)` }).from(schema.permits).all();
  const [deals] = db.select({ count: sql<number>`count(*)` }).from(schema.deals).where(sql`stage != 'closed'`).all();
  const [inquiries] = db.select({ count: sql<number>`count(*)` }).from(schema.inquiries).where(sql`status = 'new'`).all();

  // Recent 3 months of sale volume
  const totalSaleValue = db
    .select({ total: sql<number>`COALESCE(SUM(sale_price), 0)` })
    .from(schema.comps)
    .where(sql`type = 'Sale' AND sale_date >= date((SELECT MAX(sale_date) FROM comps WHERE type = 'Sale'), '-3 months')`)
    .all()[0];

  const totalPermitValue = db
    .select({ total: sql<number>`COALESCE(SUM(estimated_value), 0)` })
    .from(schema.permits)
    .where(sql`issue_date >= date((SELECT MAX(issue_date) FROM permits), '-3 months')`)
    .all()[0];

  // Monthly sale aggregations
  // Quarterly sale aggregations
  const quarterlySales = db.all<{ quarter: string; count: number; volume: number }>(
    sql`SELECT strftime('%Y', sale_date) || '-Q' || ((CAST(strftime('%m', sale_date) AS INTEGER) - 1) / 3 + 1) as quarter,
           COUNT(*) as count,
           COALESCE(SUM(sale_price), 0) as volume
    FROM comps
    WHERE type = 'Sale' AND sale_date IS NOT NULL
    GROUP BY quarter
    ORDER BY quarter DESC
    LIMIT 8`
  );

  // Quarterly permit aggregations
  const quarterlyPermits = db.all<{ quarter: string; count: number; value: number }>(
    sql`SELECT strftime('%Y', issue_date) || '-Q' || ((CAST(strftime('%m', issue_date) AS INTEGER) - 1) / 3 + 1) as quarter,
           COUNT(*) as count,
           COALESCE(SUM(estimated_value), 0) as value
    FROM permits
    WHERE issue_date IS NOT NULL
    GROUP BY quarter
    ORDER BY quarter DESC
    LIMIT 8`
  );

  // Recent sales
  const recentSales = db.all(
    sql`SELECT id, address, city, sale_date, sale_price, seller, purchaser, property_type
    FROM comps WHERE type = 'Sale' ORDER BY sale_date DESC LIMIT 5`
  );

  // Recent permits
  const recentPermits = db
    .select()
    .from(schema.permits)
    .orderBy(sql`issue_date DESC`)
    .limit(5)
    .all();

  return NextResponse.json({
    counts: {
      companies: companies.count,
      people: people.count,
      properties: properties.count,
      sales: salesCount.count,
      leases: leasesCount.count,
      permits: permits.count,
      activeDeals: deals.count,
      newInquiries: inquiries.count,
    },
    totals: {
      saleValue: totalSaleValue.total,
      permitValue: totalPermitValue.total,
    },
    recentSales,
    recentPermits,
    quarterlySales,
    quarterlyPermits,
  });
}
