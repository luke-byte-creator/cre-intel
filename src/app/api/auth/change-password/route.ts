import { NextRequest, NextResponse } from "next/server";
import { getUser, hashPassword, verifyPassword } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
  }

  if (body.newPassword.length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }

  const db = new Database(DB_PATH);
  try {
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    const newHash = hashPassword(body.newPassword);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(newHash, new Date().toISOString(), user.id);

    return NextResponse.json({ success: true });
  } finally {
    db.close();
  }
}
