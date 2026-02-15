import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// Mock leaderboard data — proof of concept
const MOCK_NAMES = ["Michael", "Shane", "Dallon", "Ben", "Luke", "Kim"];

function generateLeaderboard() {
  // Deterministic-ish but changes daily so it looks alive
  const daySeed = Math.floor(Date.now() / 86400000);
  const entries = MOCK_NAMES.map((name, i) => {
    // Simple hash: rotate contributions based on day
    const hash = ((daySeed * (i + 7) * 31) % 61); // 0-60
    return { userId: i + 1, name, earned: hash };
  });
  // Sort descending by earned
  entries.sort((a, b) => b.earned - a.earned);
  return entries;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  return NextResponse.json({ leaderboard: generateLeaderboard() });
}
