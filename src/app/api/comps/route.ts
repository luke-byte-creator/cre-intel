import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql, asc, desc } from "drizzle-orm";

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

  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.comps)
    .where(where);

  const data = await db.select()
    .from(schema.comps)
    .where(where)
    .orderBy(sortDir === "asc" ? asc(sortCol as unknown as Parameters<typeof asc>[0]) : desc(sortCol as unknown as Parameters<typeof desc>[0]))
    .limit(limit)
    .offset(page * limit);

  return NextResponse.json({
    data,
    total: countResult.count,
    page,
    limit,
  });
}
