import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { userId, amount, reason } = await req.json();
  if (!userId || !amount || !reason) {
    return NextResponse.json({ error: "userId, amount, and reason required" }, { status: 400 });
  }

  const newBalance = awardCredits(userId, amount, reason);
  return NextResponse.json({ ok: true, newBalance });
}
