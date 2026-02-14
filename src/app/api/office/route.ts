import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql, asc, desc } from "drizzle-orm";

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
