import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import { verifyPassword } from "@/lib/auth";
import { getAccessLevel } from "@/lib/credit-service";
import { getClientIp } from "@/lib/security";

// Rate limit: 5 attempts per 15 minutes per IP
const loginAttempts = new Map<string, number[]>();
function checkLoginRate(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < window);
  if (attempts.length >= 5) { loginAttempts.set(ip, attempts); return false; }
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  if (loginAttempts.size > 500) {
    for (const [k, v] of loginAttempts) {
      const f = v.filter(t => now - t < window);
      if (f.length === 0) loginAttempts.delete(k); else loginAttempts.set(k, f);
    }
  }
  return true;
}

// Email-based rate limiting: 5 failed attempts per 15 minutes per email
const emailFailedAttempts = new Map<string, { count: number; lockUntil?: number }>();
function checkEmailRate(email: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 minutes
  const record = emailFailedAttempts.get(email.toLowerCase()) || { count: 0 };
  
  // Check if currently locked
  if (record.lockUntil && now < record.lockUntil) {
    return { 
      allowed: false, 
      retryAfter: Math.ceil((record.lockUntil - now) / 1000) 
    };
  }
  
  // If lock expired, reset
  if (record.lockUntil && now >= record.lockUntil) {
    emailFailedAttempts.delete(email.toLowerCase());
    return { allowed: true };
  }
  
  return { allowed: true };
}

function recordFailedLogin(email: string): void {
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 minutes
  const key = email.toLowerCase();
  const record = emailFailedAttempts.get(key) || { count: 0 };
  
  record.count++;
  
  if (record.count >= 5) {
    record.lockUntil = now + window;
  }
  
  emailFailedAttempts.set(key, record);
  
  // Cleanup old entries periodically
  if (emailFailedAttempts.size > 200) {
    for (const [k, v] of emailFailedAttempts) {
      if (v.lockUntil && now > v.lockUntil) {
        emailFailedAttempts.delete(k);
      }
    }
  }
}

function resetEmailFailures(email: string): void {
  emailFailedAttempts.delete(email.toLowerCase());
}

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!checkLoginRate(ip)) {
      return NextResponse.json({ ok: false, error: "Too many login attempts. Try again in 15 minutes." }, { status: 429 });
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password required" }, { status: 400 });
    }

    // Check email-based rate limiting
    const emailRateCheck = checkEmailRate(email);
    if (!emailRateCheck.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Too many login attempts. Try again later." }, 
        { status: 429 }
      );
      if (emailRateCheck.retryAfter) {
        response.headers.set("X-Retry-After", emailRateCheck.retryAfter.toString());
      }
      return response;
    }

    const db = new Database(DB_PATH);
    const user = db.prepare("SELECT id, email, name, role, password_hash, credit_balance, is_exempt FROM users WHERE email = ?").get(email) as any;

    if (!user || !verifyPassword(password, user.password_hash)) {
      db.close();
      // Record failed login attempt for this email
      recordFailedLogin(email);
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    // Successful login - reset failed attempts counter for this email
    resetEmailFailures(email);

    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Max 30 days
    const lastActivity = now.toISOString();

    db.prepare("INSERT INTO auth_sessions (id, user_id, expires_at, created_at, last_activity) VALUES (?, ?, ?, ?, ?)").run(
      sessionId, user.id, expiresAt, now.toISOString(), lastActivity
    );
    db.close();

    const balance = user.credit_balance ?? 0;
    const res = NextResponse.json({
      ok: true,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        creditBalance: balance,
        accessLevel: getAccessLevel(balance),
      },
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
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
