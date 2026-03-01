import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, sql, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const type = req.nextUrl.searchParams.get("type") || "companies";
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "40")));
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get("offset") || "0"));

  if (type === "companies") {
    const [totalRow] = db.select({ count: sql<number>`count(*)` }).from(schema.companies).all();
    const total = totalRow?.count || 0;

    // Sort by latest comp activity (seller/purchaser/landlord/tenant match), active first
    const items = db.all(sql`
      SELECT c.*,
        MAX(comp.sale_date) as latestActivity
      FROM companies c
      LEFT JOIN comps comp ON comp.seller_company_id = c.id
        OR comp.purchaser_company_id = c.id
        OR comp.landlord_company_id = c.id
        OR comp.tenant_company_id = c.id
      GROUP BY c.id
      ORDER BY latestActivity IS NULL, latestActivity DESC, c.name
      LIMIT ${limit} OFFSET ${offset}
    `) as any[];

    // Get first director for each company
    if (items.length > 0) {
      const ids = items.map((c: any) => c.id);
      const directors = db
        .select({
          companyId: schema.companyPeople.companyId,
          fullName: schema.people.fullName,
          title: schema.companyPeople.title,
        })
        .from(schema.companyPeople)
        .innerJoin(schema.people, eq(schema.companyPeople.personId, schema.people.id))
        .where(sql`${schema.companyPeople.companyId} IN (${sql.raw(ids.join(","))}) AND ${schema.companyPeople.role} = 'Director'`)
        .all();

      const dirMap = new Map<number, string>();
      for (const d of directors) {
        if (!dirMap.has(d.companyId)) {
          dirMap.set(d.companyId, d.title ? `${d.fullName} (${d.title})` : d.fullName);
        }
      }

      return NextResponse.json({
        items: items.map((c: any) => ({ ...c, director: dirMap.get(c.id) || null })),
        total,
      });
    }

    return NextResponse.json({ items, total });
  }

  if (type === "people") {
    const [totalRow] = db.select({ count: sql<number>`count(*)` }).from(schema.people).all();
    const total = totalRow?.count || 0;

    const items = db.select().from(schema.people)
      .orderBy(schema.people.fullName)
      .limit(limit).offset(offset).all();

    // Get company association for each person
    if (items.length > 0) {
      const ids = items.map(p => p.id);
      const assocs = db
        .select({
          personId: schema.companyPeople.personId,
          companyName: schema.companies.name,
        })
        .from(schema.companyPeople)
        .innerJoin(schema.companies, eq(schema.companyPeople.companyId, schema.companies.id))
        .where(sql`${schema.companyPeople.personId} IN (${sql.raw(ids.join(","))})`)
        .all();

      const compMap = new Map<number, string[]>();
      for (const a of assocs) {
        const existing = compMap.get(a.personId) || [];
        if (!existing.includes(a.companyName)) existing.push(a.companyName);
        compMap.set(a.personId, existing);
      }

      return NextResponse.json({
        items: items.map(p => {
          const companies = compMap.get(p.id) || [];
          let companyName: string | null = null;
          if (companies.length === 1) companyName = companies[0];
          else if (companies.length === 2) companyName = companies.join(" · ");
          else if (companies.length > 2) companyName = `${companies[0]} · ${companies[1]} · +${companies.length - 2} more`;
          return { ...p, companyName };
        }),
        total,
      });
    }

    return NextResponse.json({ items, total });
  }

  if (type === "properties") {
    // Only show properties with recent activity (transactions or permits), sorted by most recent
    const countResult = db.all(sql`
      SELECT COUNT(*) as count FROM (
        SELECT DISTINCT p.id FROM properties p
        LEFT JOIN transactions t ON t.property_id = p.id
        LEFT JOIN permits pm ON pm.property_id = p.id
        LEFT JOIN comps comp ON comp.property_id = p.id
        WHERE t.id IS NOT NULL OR pm.id IS NOT NULL OR comp.id IS NOT NULL
      )
    `) as any[];
    const total = countResult[0]?.count || 0;

    const items = db.all(sql`
      SELECT p.*, MAX(COALESCE(t.transfer_date, pm.issue_date, comp.sale_date)) as latestActivity
      FROM properties p
      LEFT JOIN transactions t ON t.property_id = p.id
      LEFT JOIN permits pm ON pm.property_id = p.id
      LEFT JOIN comps comp ON comp.property_id = p.id
      WHERE t.id IS NOT NULL OR pm.id IS NOT NULL OR comp.id IS NOT NULL
      GROUP BY p.id
      ORDER BY latestActivity DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return NextResponse.json({ items, total });
  }

  if (type === "comps") {
    const [totalRow] = db.select({ count: sql<number>`count(*)` }).from(schema.comps).all();
    const total = totalRow?.count || 0;

    const items = db.select().from(schema.comps)
      .orderBy(desc(schema.comps.saleDate))
      .limit(limit).offset(offset).all();

    return NextResponse.json({ items, total });
  }

  return NextResponse.json({ items: [], total: 0 });
}
