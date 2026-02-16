import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireFullAccess } from "@/lib/auth";
import { sql, eq, asc } from "drizzle-orm";
import { awardCredits } from "@/lib/credit-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const search = req.nextUrl.searchParams.get("search") || "";
  const sfMin = req.nextUrl.searchParams.get("sfMin") || "";
  const sfMax = req.nextUrl.searchParams.get("sfMax") || "";

  const developments = db.select().from(schema.retailDevelopments)
    .orderBy(asc(schema.retailDevelopments.sortOrder)).all();

  const allTenants = db.select().from(schema.retailTenants)
    .orderBy(asc(schema.retailTenants.sortOrder)).all();

  // Group tenants by development
  const tenantMap = new Map<number, typeof allTenants>();
  for (const t of allTenants) {
    if (!tenantMap.has(t.developmentId)) tenantMap.set(t.developmentId, []);
    tenantMap.get(t.developmentId)!.push(t);
  }

  // Filter
  let result = developments.map(d => ({
    ...d,
    tenants: (tenantMap.get(d.id) || []).filter(t => {
      if (search && !t.tenantName.toLowerCase().includes(search.toLowerCase())) return false;
      if (sfMin && (t.areaSF == null || t.areaSF < Number(sfMin))) return false;
      if (sfMax && (t.areaSF == null || t.areaSF > Number(sfMax))) return false;
      return true;
    }),
  }));

  if (search || sfMin || sfMax) result = result.filter(d => d.tenants.length > 0);

  return NextResponse.json({ data: result });
}

// Create a new development
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  db.insert(schema.retailDevelopments).values({
    name: body.name,
    area: body.area || null,
    address: body.address || null,
    notes: body.notes || null,
  }).run();

  awardCredits(auth.user.id, 1, "update_retail_dev", undefined, undefined, `Added retail development — ${body.name}`);
  return NextResponse.json({ ok: true });
}
