import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { sql, asc, desc, eq } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const u = req.nextUrl.searchParams;
  const search = u.get("search") || "";
  const region = u.get("region") || "";
  const zone = u.get("zone") || "";
  const hideCondo = u.get("hideCondo") !== "false"; // default hide condos
  const sortBy = u.get("sortBy") || "units";
  const sortDir = u.get("sortDir") || "desc";
  const page = Math.max(1, parseInt(u.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(u.get("limit") || "50")));

  const conditions = [];
  if (search) {
    conditions.push(sql`(${schema.multiBuildings.address} LIKE ${"%" + search + "%"} OR ${schema.multiBuildings.buildingOwner} LIKE ${"%" + search + "%"} OR ${schema.multiBuildings.buildingName} LIKE ${"%" + search + "%"} OR ${schema.multiBuildings.propertyManager} LIKE ${"%" + search + "%"})`);
  }
  if (region) conditions.push(sql`${schema.multiBuildings.region} = ${region}`);
  if (zone) conditions.push(sql`${schema.multiBuildings.cmhcZone} = ${zone}`);
  if (hideCondo) conditions.push(sql`${schema.multiBuildings.isCondo} = 0`);

  const where = conditions.length ? sql.join(conditions, sql` AND `) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortMap: Record<string, any> = {
    units: schema.multiBuildings.units,
    assessedValue: schema.multiBuildings.assessedValue,
    address: schema.multiBuildings.address,
    buildingOwner: schema.multiBuildings.buildingOwner,
    region: schema.multiBuildings.region,
    yearBuilt: schema.multiBuildings.yearBuilt,
  };
  const col = sortMap[sortBy] || schema.multiBuildings.units;
  const dirFn = sortDir === "asc" ? asc : desc;

  const [{ count: total }] = db.select({ count: sql<number>`count(*)` }).from(schema.multiBuildings).where(where).all();

  const offset = (page - 1) * limit;
  let query = db.select().from(schema.multiBuildings);
  if (where) query = query.where(where) as typeof query;
  const data = query.orderBy(dirFn(col)).limit(limit).offset(offset).all();

  // Get zones for filter dropdown
  const zones = db.all<{ zone: string; count: number }>(
    sql`SELECT cmhc_zone as zone, COUNT(*) as count FROM multi_buildings WHERE is_condo = 0 AND cmhc_zone IS NOT NULL GROUP BY cmhc_zone ORDER BY cmhc_zone`
  );

  return NextResponse.json({ data, total, page, limit, zones });
}

// Add a new multifamily building
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const body = await req.json();

  if (!body.address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const result = db.insert(schema.multiBuildings).values({
    address: body.address,
    buildingName: body.buildingName || null,
    units: body.units ? Number(body.units) : null,
    yearBuilt: body.yearBuilt ? Number(body.yearBuilt) : null,
    buildingOwner: body.buildingOwner || null,
    region: body.region || null,
    cmhcZone: body.cmhcZone || null,
  }).run();

  

  return NextResponse.json({ id: result.lastInsertRowid });
}
