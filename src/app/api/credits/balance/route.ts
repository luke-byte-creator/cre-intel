import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserBalance, getAccessLevel } from "@/lib/credit-service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const balance = getUserBalance(auth.user.id);
  const accessLevel = getAccessLevel(balance);

  return NextResponse.json({ balance, accessLevel });
}
