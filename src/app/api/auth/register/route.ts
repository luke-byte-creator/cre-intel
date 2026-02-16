import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { CREDIT_CONFIG } from "@/lib/credits";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "name, email, and password required" }, { status: 400 });
    }

    // Registration locked to @cbre.com emails only
    if (!email.toLowerCase().endsWith("@cbre.com")) {
      return NextResponse.json({ error: "Registration is restricted to authorized email domains" }, { status: 403 });
    }

    const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).all();
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const [user] = db.insert(schema.users).values({
      name,
      email,
      passwordHash,
      role: "member",
      creditBalance: CREDIT_CONFIG.STARTING_BALANCE,
      isExempt: 0,
    }).returning().all();

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.insert(schema.authSessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt,
    }).run();

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, creditBalance: user.creditBalance },
    });
    res.cookies.set("nova_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
