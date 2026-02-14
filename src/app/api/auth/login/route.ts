import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import { verifyPassword } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password required" }, { status: 400 });
    }

    const db = new Database(DB_PATH);
    const user = db.prepare("SELECT id, email, name, role, password_hash FROM users WHERE email = ?").get(email) as any;

    if (!user || !verifyPassword(password, user.password_hash)) {
      db.close();
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare("INSERT INTO auth_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
      sessionId, user.id, expiresAt, new Date().toISOString()
    );
    db.close();

    const res = NextResponse.json({ ok: true, user: { name: user.name, email: user.email, role: user.role } });
    res.cookies.set("nova_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
