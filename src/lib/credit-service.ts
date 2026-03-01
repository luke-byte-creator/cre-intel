import { db, schema } from "@/db";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { CREDIT_CONFIG } from "./credits";

export type AccessLevel = "full" | "readonly" | "locked";

export function getUserBalance(userId: number): number {
  const [user] = db.select({ creditBalance: schema.users.creditBalance })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
    .all();
  return user?.creditBalance ?? 0;
}

export function awardCredits(
  userId: number,
  amount: number,
  reason: string,
  compId?: number | null,
  metadata?: string | null,
  description?: string | null
): number {
  const currentBalance = getUserBalance(userId);
  const newBalance = Math.min(currentBalance + amount, CREDIT_CONFIG.MAX_BALANCE);
  const actualAmount = newBalance - currentBalance;

  if (actualAmount === 0 && amount > 0) return newBalance; // already at cap

  db.insert(schema.creditLedger).values({
    userId,
    amount: actualAmount,
    reason,
    compId: compId ?? null,
    metadata: metadata ?? null,
    description: description ?? null,
  }).run();

  db.update(schema.users)
    .set({ creditBalance: newBalance, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, userId))
    .run();

  return newBalance;
}

export function deductDaily(): number {
  const nonExemptUsers = db.select({ id: schema.users.id, creditBalance: schema.users.creditBalance })
    .from(schema.users)
    .where(eq(schema.users.isExempt, 0))
    .all();

  let count = 0;
  for (const user of nonExemptUsers) {
    const newBalance = user.creditBalance - CREDIT_CONFIG.DAILY_DECAY;
    db.insert(schema.creditLedger).values({
      userId: user.id,
      amount: -CREDIT_CONFIG.DAILY_DECAY,
      reason: "daily_decay",
    }).run();
    db.update(schema.users)
      .set({ creditBalance: newBalance, updatedAt: new Date().toISOString() })
      .where(eq(schema.users.id, user.id))
      .run();
    count++;
  }
  return count;
}

export function getAccessLevel(creditBalance: number): AccessLevel {
  if (creditBalance >= 1) return "full";
  if (creditBalance >= -2) return "readonly";
  return "locked";
}

export function getLedger(userId: number, limit = 50) {
  return db.select()
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId))
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(limit)
    .all();
}

export function getLeaderboard(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return db.select({
    userId: schema.creditLedger.userId,
    name: schema.users.name,
    earned: sql<number>`sum(case when ${schema.creditLedger.amount} > 0 then ${schema.creditLedger.amount} else 0 end)`,
  })
    .from(schema.creditLedger)
    .innerJoin(schema.users, eq(schema.creditLedger.userId, schema.users.id))
    .where(and(
      gte(schema.creditLedger.createdAt, since),
      sql`${schema.creditLedger.reason} != 'daily_decay'`
    ))
    .groupBy(schema.creditLedger.userId)
    .orderBy(sql`3 DESC`)
    .limit(10)
    .all();
}
