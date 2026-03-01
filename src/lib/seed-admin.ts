import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "cre-intel.db");

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export async function seedAdmin() {
  const db = new Database(DB_PATH);

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get("ljjansen6767@gmail.com");
  if (existing) {
    // Update existing user to have credit fields
    db.prepare(`
      UPDATE users SET
        role = 'admin',
        credit_balance = 90,
        is_exempt = 1,
        updated_at = ?
      WHERE email = ?
    `).run(new Date().toISOString(), "ljjansen6767@gmail.com");
    console.log("Updated Luke's account to admin+exempt with 90 credits");
  } else {
    db.prepare(`
      INSERT INTO users (email, password_hash, name, role, credit_balance, is_exempt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "ljjansen6767@gmail.com",
      hashPassword("nova2026"),
      "Luke Jansen",
      "admin",
      90,
      1,
      new Date().toISOString(),
      new Date().toISOString()
    );
    console.log("Created Luke's admin account with 90 credits");
  }

  db.close();
}

// Run directly
seedAdmin().catch(console.error);
