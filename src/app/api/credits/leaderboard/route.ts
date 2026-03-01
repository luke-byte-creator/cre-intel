import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/credit-service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const leaderboard = getLeaderboard(7);
  return NextResponse.json({ leaderboard });
}
