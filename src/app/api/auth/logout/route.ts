import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { getSessionToken } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");

export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  if (token) {
    try {
      const db = new Database(DB_PATH);
      db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(token);
      db.close();
    } catch {}
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("nova_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
