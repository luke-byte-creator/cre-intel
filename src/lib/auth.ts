import crypto from "crypto";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === testHash;
}

export function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get("nova_session")?.value || null;
}

export async function requireAuth(request: NextRequest): Promise<{ user: User } | Response> {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user };
}

export async function getUser(request: NextRequest): Promise<User | null> {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const db = new Database(DB_PATH);
    const row = db.prepare(`
      SELECT u.id, u.email, u.name, u.role
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).get(token) as User | undefined;
    db.close();
    return row || null;
  } catch {
    return null;
  }
}
