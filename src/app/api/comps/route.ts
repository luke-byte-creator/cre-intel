import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { sql, asc, desc } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";
import { CREDIT_CONFIG, isCompResearched, isCompKeyFieldsComplete } from "@/lib/credits";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const params = req.nextUrl.searchParams;
  const type = params.get("type");
  const propertyType = params.get("propertyType");
  const city = params.get("city");
  const search = params.get("search");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const priceMin = params.get("priceMin");
  const priceMax = params.get("priceMax");
  const sizeMin = params.get("sizeMin");
  const sizeMax = params.get("sizeMax");
  const sortBy = params.get("sortBy") || "sale_date";
  const hideResearched = params.get("hideResearched") === "true";
  const researchedOnly = params.get("researchedOnly") === "true";
  const sortDir = params.get("sortDir") || "desc";
  const page = parseInt(params.get("page") || "0");
  const limit = parseInt(params.get("limit") || "50");

  const conditions = [];

  if (type) conditions.push(sql`${schema.comps.type} = ${type}`);
  if (propertyType) conditions.push(sql`${schema.comps.propertyType} = ${propertyType}`);
  if (city) conditions.push(sql`${schema.comps.city} = ${city}`);
  if (dateFrom) conditions.push(sql`${schema.comps.saleDate} >= ${dateFrom}`);
  if (dateTo) conditions.push(sql`${schema.comps.saleDate} <= ${dateTo}`);
  if (priceMin) conditions.push(sql`${schema.comps.salePrice} >= ${parseFloat(priceMin)}`);
  if (priceMax) conditions.push(sql`${schema.comps.salePrice} <= ${parseFloat(priceMax)}`);
  if (sizeMin) conditions.push(sql`${schema.comps.areaSF} >= ${parseFloat(sizeMin)}`);
  if (sizeMax) conditions.push(sql`${schema.comps.areaSF} <= ${parseFloat(sizeMax)}`);

  const source = params.get("source");
  if (source === "compfolio") {
    conditions.push(sql`${schema.comps.source} = 'compfolio'`);
  } else if (source === "transfer") {
    conditions.push(sql`${schema.comps.source} LIKE 'transfer%'`);
  } else if (source === "other") {
    conditions.push(sql`${schema.comps.source} NOT LIKE 'transfer%' AND ${schema.comps.source} != 'compfolio'`);
  }

  const excludeSource = params.get("excludeSource");
  if (excludeSource === "transfer") {
    conditions.push(sql`(${schema.comps.source} NOT LIKE 'transfer%' OR ${schema.comps.source} IS NULL)`);
  }

  if (search) {
    const pat = `%${search}%`;
    conditions.push(sql`(
      ${schema.comps.address} LIKE ${pat} OR
      ${schema.comps.seller} LIKE ${pat} OR
      ${schema.comps.purchaser} LIKE ${pat} OR
      ${schema.comps.tenant} LIKE ${pat} OR
      ${schema.comps.landlord} LIKE ${pat} OR
      ${schema.comps.propertyName} LIKE ${pat} OR
      ${schema.comps.city} LIKE ${pat}
    )`);
  }

  // hideResearched is applied post-query to support auto-researched detection

  const where = conditions.length > 0 ? sql.join(conditions, sql` AND `) : sql`1=1`;

  const validCols: Record<string, unknown> = {
    sale_date: schema.comps.saleDate,
    sale_price: schema.comps.salePrice,
    address: schema.comps.address,
    property_type: schema.comps.propertyType,
    cap_rate: schema.comps.capRate,
    net_rent_psf: schema.comps.netRentPSF,
    annual_rent: schema.comps.annualRent,
    area_sf: schema.comps.areaSF,
    city: schema.comps.city,
  };

  const sortCol = validCols[sortBy] || schema.comps.saleDate;

  const needsPostFilter = hideResearched || researchedOnly;
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const enrich = (comp: typeof schema.comps.$inferSelect) => {
    const manuallyFlagged = comp.researchedUnavailable === 1;
    const isExpired = manuallyFlagged && comp.researchedAt != null && comp.researchedAt < twelveMonthsAgo;
    const keyFieldsComplete = isCompKeyFieldsComplete(comp as unknown as Record<string, unknown>);
    const researched = isCompResearched(comp as unknown as Record<string, unknown>);
    return {
      ...comp,
      researchedExpired: isExpired,
      isResearched: researched && !isExpired,
      isAutoResearched: keyFieldsComplete && !manuallyFlagged,
    };
  };

  if (needsPostFilter) {
    // Fetch all matching rows, filter by research status, then paginate in memory
    const allData = await db.select()
      .from(schema.comps)
      .where(where)
      .orderBy(sortDir === "asc" ? asc(sortCol as unknown as Parameters<typeof asc>[0]) : desc(sortCol as unknown as Parameters<typeof desc>[0]));

    const enriched = allData.map(enrich);
    const filtered = hideResearched
      ? enriched.filter(c => !c.isResearched)
      : enriched.filter(c => c.isResearched);

    const paged = filtered.slice(page * limit, (page + 1) * limit);

    return NextResponse.json({
      data: paged,
      total: filtered.length,
      page,
      limit,
    });
  }

  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.comps)
    .where(where);

  const data = await db.select()
    .from(schema.comps)
    .where(where)
    .orderBy(sortDir === "asc" ? asc(sortCol as unknown as Parameters<typeof asc>[0]) : desc(sortCol as unknown as Parameters<typeof desc>[0]))
    .limit(limit)
    .offset(page * limit);

  const enriched = data.map(enrich);

  return NextResponse.json({
    data: enriched,
    total: countResult.count,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  if (!body.address || !body.type) {
    return NextResponse.json({ error: "address and type required" }, { status: 400 });
  }

  const { normalizeAddress, normalizeCity } = await import("@/lib/address");
  const [comp] = db.insert(schema.comps).values({
    type: body.type,
    address: body.address,
    ...body,
    addressNormalized: normalizeAddress(body.address),
    cityNormalized: normalizeCity(body.city || 'Saskatoon'),
  }).returning().all();

  // Link to properties and companies
  const { linkComp } = await import("@/lib/comp-linker");
  linkComp(comp.id);

  // Award credits for adding a comp
  awardCredits(auth.user.id, CREDIT_CONFIG.ACTIONS.ADD_COMP, "add_comp", comp.id, undefined, `Added ${(body.type || "").toLowerCase()} comp — ${body.address}`);

  // Re-fetch with linked IDs
  const [linked] = db.select().from(schema.comps).where(sql`id = ${comp.id}`).all();
  return NextResponse.json(linked || comp, { status: 201 });
}
