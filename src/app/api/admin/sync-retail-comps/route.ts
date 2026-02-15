import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncRetailTenantToComp } from "@/lib/retail-comp-sync";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const tenants = db.select().from(schema.retailTenants).all();
  let synced = 0;
  for (const t of tenants) {
    if (t.netRentPSF != null || t.annualRent != null || t.leaseStart != null || t.leaseExpiry != null) {
      syncRetailTenantToComp(t.id);
      synced++;
    }
  }

  return NextResponse.json({ synced });
}
