import { NextRequest, NextResponse } from "next/server";
import { requireFullAccess } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";
import { db, schema } from "@/db";
import { eq, and, like } from "drizzle-orm";
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
  const quarter = searchParams.get("quarter");
  const year = searchParams.get("year");
  const brokerage = searchParams.get("brokerage");

  let query = db.select().from(schema.industrialVacancies);
  const conditions = [];

  if (quarter) conditions.push(eq(schema.industrialVacancies.quarterRecorded, quarter));
  if (year) conditions.push(eq(schema.industrialVacancies.yearRecorded, Number(year)));
  if (brokerage) conditions.push(eq(schema.industrialVacancies.listingBrokerage, brokerage));

  const rows = conditions.length > 0
    ? query.where(and(...conditions)).all()
    : query.all();

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

  const result = db.insert(schema.industrialVacancies).values({
    buildingId,
    address: body.address,
    availableSF: body.availableSF || null,
    totalBuildingSF,
    listingBrokerage: body.listingBrokerage || null,
    listingType: body.listingType || null,
    quarterRecorded,
    yearRecorded,
    notes: body.notes || null,
  }).returning().get();

  awardCredits(auth.user.id, 1, "update_industrial_vacancy");

  return NextResponse.json(result);
}
