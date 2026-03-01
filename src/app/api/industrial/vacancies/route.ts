import { NextRequest, NextResponse } from "next/server";
import { requireFullAccess } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";
import { db, schema } from "@/db";
import { eq, and, like, gte, lte, or, isNull } from "drizzle-orm";
import fs from "fs";
import path from "path";

const INVENTORY_PATH = path.join(process.cwd(), "public", "data", "inventory.json");

function getInventoryTotalSF(): number {
  try {
    const data = JSON.parse(fs.readFileSync(INVENTORY_PATH, "utf-8"));
    return data.reduce((sum: number, b: { areaSF?: number | null }) => sum + (b.areaSF || 0), 0);
  } catch {
    return 0;
  }
}

function matchBuilding(address: string): { id: string | null; areaSF: number | null } | null {
  try {
    const data = JSON.parse(fs.readFileSync(INVENTORY_PATH, "utf-8"));
    const normalized = address.toLowerCase().trim();
    const match = data.find((b: { address: string }) =>
      b.address.toLowerCase().trim() === normalized
    );
    return match ? { id: match.id, areaSF: match.areaSF } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { requireAuth } = await import("@/lib/auth");
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const quarter = searchParams.get("quarter"); // e.g. "Q1"
  const year = searchParams.get("year"); // e.g. "2026"
  const brokerage = searchParams.get("brokerage");
  const viewAll = searchParams.get("viewAll") === "true";

  // Calculate quarter date boundaries
  function getQuarterDates(q: string, y: number): { start: string; end: string } {
    const qNum = parseInt(q.replace("Q", ""));
    const startMonth = (qNum - 1) * 3; // 0-indexed
    const start = new Date(y, startMonth, 1).toISOString();
    const end = new Date(y, startMonth + 3, 0, 23, 59, 59).toISOString();
    return { start, end };
  }

  let rows;
  if (viewAll) {
    rows = db.select().from(schema.industrialVacancies).all();
  } else if (quarter && year) {
    const { start, end } = getQuarterDates(quarter, Number(year));
    // A listing is "in this quarter" if: first_seen <= quarter end AND last_seen >= quarter start
    // For records without first_seen/last_seen, fall back to created_at
    rows = db.select().from(schema.industrialVacancies).all().filter(r => {
      const firstSeen = r.firstSeen || r.createdAt;
      const lastSeen = r.lastSeen || r.createdAt;
      return firstSeen <= end && lastSeen >= start;
    });
  } else {
    rows = db.select().from(schema.industrialVacancies).all();
  }

  if (brokerage) {
    rows = rows.filter(r => r.listingBrokerage === brokerage);
  }

  const totalAvailableSF = rows.reduce((sum, r) => sum + (r.availableSF || 0), 0);
  const totalInventorySF = getInventoryTotalSF();
  const vacancyRate = totalInventorySF > 0
    ? Number(((totalAvailableSF / totalInventorySF) * 100).toFixed(2))
    : 0;

  return NextResponse.json({
    vacancies: rows,
    stats: {
      count: rows.length,
      totalAvailableSF,
      totalInventorySF,
      vacancyRate,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  if (!body.address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const now = new Date();
  const currentQ = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const currentYear = now.getFullYear();
  const quarterRecorded = body.quarterRecorded || `${currentQ} ${currentYear}`;
  const yearRecorded = body.yearRecorded || currentYear;

  // Try to auto-match address
  const match = matchBuilding(body.address);
  let buildingId = null;
  let totalBuildingSF = body.totalBuildingSF || null;
  if (match?.id) {
    buildingId = Number(match.id) || null;
    if (!totalBuildingSF && match.areaSF) {
      totalBuildingSF = match.areaSF;
    }
  }

  const { normalizeAddress, displayAddress } = await import("@/lib/address");
  const norm = normalizeAddress(body.address);
  const display = norm ? displayAddress(norm) || body.address : body.address;
  const result = db.insert(schema.industrialVacancies).values({
    buildingId,
    address: display,
    addressNormalized: norm,
    availableSF: body.availableSF || null,
    totalBuildingSF,
    listingBrokerage: body.listingBrokerage || null,
    listingType: body.listingType || null,
    quarterRecorded,
    yearRecorded,
    notes: body.notes || null,
  }).returning().get();

  awardCredits(auth.user.id, 1, "update_industrial_vacancy", undefined, undefined, `Added vacancy record — ${body.address}`);

  return NextResponse.json(result);
}
