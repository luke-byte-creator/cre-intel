import { NextRequest, NextResponse } from "next/server";
import { deductDaily } from "@/lib/credit-service";

const DECAY_SECRET = "nova-credits-decay-key-2026";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const authHeader = req.headers.get("authorization");
  const key = body.key || authHeader?.replace("Bearer ", "");

  if (key !== DECAY_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = deductDaily();
  return NextResponse.json({ ok: true, usersDecayed: count });
}
