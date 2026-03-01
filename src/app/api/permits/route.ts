import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql, and, like, gte, lte, asc, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const u = req.nextUrl.searchParams;
  const search = u.get("search") || "";
  const dateFrom = u.get("dateFrom") || "";
  const dateTo = u.get("dateTo") || "";
  const sortBy = u.get("sortBy") || "estimatedValue";
  const sortDir = u.get("sortDir") || "desc";
  const page = Math.max(1, parseInt(u.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(u.get("limit") || "50")));

  const conditions = [];
  if (search) {
    conditions.push(sql`(${schema.permits.address} LIKE ${"%" + search + "%"} OR ${schema.permits.applicant} LIKE ${"%" + search + "%"})`);
  }
  if (dateFrom) conditions.push(gte(schema.permits.issueDate, dateFrom));
  if (dateTo) conditions.push(lte(schema.permits.issueDate, dateTo));

  const where = conditions.length ? and(...conditions) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortMap: Record<string, any> = {
    estimatedValue: schema.permits.estimatedValue,
    issueDate: schema.permits.issueDate,
    address: schema.permits.address,
    applicant: schema.permits.applicant,
  };
  const col = sortMap[sortBy] || schema.permits.estimatedValue;
  const dirFn = sortDir === "asc" ? asc : desc;

  const [{ count: total }] = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.permits)
    .where(where)
    .all();

  const offset = (page - 1) * limit;
  const rows = db
    .select()
    .from(schema.permits)
    .where(where)
    .orderBy(dirFn(col))
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json({ data: rows, total, page, limit });
}
