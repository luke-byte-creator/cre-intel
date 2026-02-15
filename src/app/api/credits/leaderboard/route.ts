import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/credit-service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const days = parseInt(req.nextUrl.searchParams.get("days") || "7");
  const leaderboard = getLeaderboard(days);

  return NextResponse.json({ leaderboard });
}
