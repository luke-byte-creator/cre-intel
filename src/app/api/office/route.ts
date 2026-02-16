import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { sql, asc, desc } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const u = req.nextUrl.searchParams;
  const search = u.get("search") || "";
  const classFilter = u.get("class") || "";
  const sortBy = u.get("sortBy") || "totalSF";
  const sortDir = u.get("sortDir") || "desc";

  const conditions = [];
  if (search) {
    conditions.push(sql`(${schema.officeBuildings.address} LIKE ${"%" + search + "%"} OR ${schema.officeBuildings.buildingName} LIKE ${"%" + search + "%"} OR ${schema.officeBuildings.owner} LIKE ${"%" + search + "%"})`);
  }
  if (classFilter) {
    conditions.push(sql`${schema.officeBuildings.buildingClass} = ${classFilter}`);
  }

  const where = conditions.length ? sql.join(conditions, sql` AND `) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortMap: Record<string, any> = {
    totalSF: schema.officeBuildings.totalSF,
    vacancyRate: schema.officeBuildings.vacancyRate,
    netAskingRate: schema.officeBuildings.netAskingRate,
    grossRate: schema.officeBuildings.grossRate,
    buildingName: schema.officeBuildings.buildingName,
    buildingClass: schema.officeBuildings.buildingClass,
    floors: schema.officeBuildings.floors,
    yearBuilt: schema.officeBuildings.yearBuilt,
  };
  const col = sortMap[sortBy] || schema.officeBuildings.totalSF;
  const dirFn = sortDir === "asc" ? asc : desc;

  let query = db.select().from(schema.officeBuildings);
  if (where) query = query.where(where) as typeof query;
  const data = query.orderBy(dirFn(col)).all();

  return NextResponse.json({ data });
}

// Add a new office building
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const body = await req.json();

  if (!body.address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const result = db.insert(schema.officeBuildings).values({
    address: body.address,
    buildingName: body.buildingName || null,
    buildingClass: body.buildingClass || null,
    totalSF: body.totalSF ? Number(body.totalSF) : null,
    floors: body.floors ? Number(body.floors) : null,
    yearBuilt: body.yearBuilt ? Number(body.yearBuilt) : null,
    owner: body.owner || null,
    neighborhood: body.neighborhood || null,
  }).run();

  awardCredits(auth.user.id, 1, "update_office", Number(result.lastInsertRowid), undefined, `Added office building — ${body.buildingName || body.address}`);

  return NextResponse.json({ id: result.lastInsertRowid });
}
