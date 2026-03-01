import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getLedger } from "@/lib/credit-service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const entries = getLedger(auth.user.id, limit);

  return NextResponse.json({ entries });
}
