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
  creditBalance: number;
  isExempt: number;
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

export async function requireFullAccess(request: NextRequest): Promise<{ user: User } | Response> {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { getAccessLevel } = await import("./credit-service");
  const level = getAccessLevel(user.creditBalance);
  if (level !== "full") {
    return Response.json(
      { error: "Insufficient credits. Contribute data to earn more access.", accessLevel: level },
      { status: 403 }
    );
  }
  return { user };
}

export async function getUser(request: NextRequest): Promise<User | null> {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const db = new Database(DB_PATH);
    
    // Check if session exists and is not expired
    const session = db.prepare(`
      SELECT s.user_id, s.expires_at, s.last_activity
      FROM auth_sessions s
      WHERE s.id = ?
    `).get(token) as { user_id: number; expires_at: string; last_activity?: string } | undefined;

    if (!session) {
      db.close();
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    
    // Check if session is expired
    if (expiresAt <= now) {
      // Clean up expired session
      db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(token);
      db.close();
      return null;
    }

    // Check if session is inactive for more than 24 hours
    const lastActivity = session.last_activity ? new Date(session.last_activity) : new Date(session.expires_at);
    const inactiveThreshold = 24 * 60 * 60 * 1000; // 24 hours
    
    if (now.getTime() - lastActivity.getTime() > inactiveThreshold) {
      // Session inactive too long, clean up
      db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(token);
      db.close();
      return null;
    }

    // Update last activity timestamp (sliding window)
    const newLastActivity = now.toISOString();
    db.prepare("UPDATE auth_sessions SET last_activity = ? WHERE id = ?").run(newLastActivity, token);

    // Get user information
    const row = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.credit_balance as creditBalance, u.is_exempt as isExempt
      FROM users u
      WHERE u.id = ?
    `).get(session.user_id) as User | undefined;
    
    db.close();
    return row || null;
  } catch (error) {
    console.error("Error in getUser:", error);
    return null;
  }
}
