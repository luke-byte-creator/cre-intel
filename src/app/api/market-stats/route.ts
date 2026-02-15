import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, sql, avg, sum, count, like, isNotNull } from "drizzle-orm";

const { officeBuildings, officeUnits, comps, retailTenants, retailDevelopments, marketStats, multiBuildings } = schema;

type AutoCalcResult = Record<string, Record<string, number | null>>;

function computeAutoCalcs(): AutoCalcResult {
  const result: AutoCalcResult = {};

  // --- OFFICE (all CBD = downtown) ---
  const officeAgg = db.select({
    totalSf: sum(officeBuildings.totalSF),
    vacantSf: sum(officeBuildings.totalVacantSF),
  }).from(officeBuildings).get();

  const totalSf = Number(officeAgg?.totalSf || 0);
  const vacantSf = Number(officeAgg?.vacantSf || 0);
  const occupiedSf = totalSf - vacantSf;
  const vacancyRate = totalSf > 0 ? (vacantSf / totalSf) * 100 : 0;

  const classARate = db.select({
    avg: avg(officeBuildings.netAskingRate),
  }).from(officeBuildings).where(eq(officeBuildings.buildingClass, "A")).get();

  const avgNetRent = db.select({
    avg: avg(officeBuildings.netAskingRate),
  }).from(officeBuildings).get();

  result["office_downtown"] = {
    inventory_sf: totalSf,
    occupied_sf: occupiedSf,
    vacant_sf: vacantSf,
    vacancy_rate: Math.round(vacancyRate * 100) / 100,
    class_a_net_rent: classARate?.avg ? Math.round(Number(classARate.avg) * 100) / 100 : null,
    avg_net_rent: avgNetRent?.avg ? Math.round(Number(avgNetRent.avg) * 100) / 100 : null,
  };

  // --- INDUSTRIAL (from comps) ---
  const indSaleAgg = db.select({
    avgPsf: avg(comps.pricePSF),
    avgCap: avg(comps.capRate),
    totalSf: sum(comps.areaSF),
    count: count(),
  }).from(comps).where(
    and(
      like(comps.propertyType, "%Industrial%"),
      eq(comps.type, "Sale"),
      isNotNull(comps.pricePSF),
    )
  ).get();

  const indLeaseAgg = db.select({
    avgRent: avg(comps.netRentPSF),
  }).from(comps).where(
    and(
      like(comps.propertyType, "%Industrial%"),
      eq(comps.type, "Lease"),
      isNotNull(comps.netRentPSF),
    )
  ).get();

  const indCapAgg = db.select({
    avgCap: avg(comps.capRate),
  }).from(comps).where(
    and(
      like(comps.propertyType, "%Industrial%"),
      eq(comps.type, "Sale"),
      isNotNull(comps.capRate),
    )
  ).get();

  result["industrial"] = {
    avg_sale_psf: indSaleAgg?.avgPsf ? Math.round(Number(indSaleAgg.avgPsf) * 100) / 100 : null,
    avg_cap_rate: indCapAgg?.avgCap ? Math.round(Number(indCapAgg.avgCap) * 100) / 100 : null,
    avg_lease_rate: indLeaseAgg?.avgRent ? Math.round(Number(indLeaseAgg.avgRent) * 100) / 100 : null,
    sale_comp_count: indSaleAgg?.count || 0,
  };

  // --- RETAIL (from retail_tenants) ---
  const retailAgg = db.select({
    total: count(),
    active: sql<number>`SUM(CASE WHEN ${retailTenants.status} = 'active' THEN 1 ELSE 0 END)`,
    closed: sql<number>`SUM(CASE WHEN ${retailTenants.status} != 'active' THEN 1 ELSE 0 END)`,
  }).from(retailTenants).get();

  result["retail"] = {
    tracked_tenants: retailAgg?.total || 0,
    active_tenants: Number(retailAgg?.active || 0),
    closed_tenants: Number(retailAgg?.closed || 0),
  };

  // --- MULTIFAMILY ---
  const multiAgg = db.select({
    totalBuildings: count(),
    totalUnits: sum(multiBuildings.units),
  }).from(multiBuildings).get();

  result["multifamily"] = {
    total_buildings: multiAgg?.totalBuildings || 0,
    total_units: Number(multiAgg?.totalUnits || 0),
  };

  return result;
}

export async function GET(req: NextRequest) {
  const years = (req.nextUrl.searchParams.get("years") || "2024,2025,2026").split(",").map(Number);

  // Get manual/override stats
  const manualStats = db.select().from(marketStats).all();

  // Get auto-calculated values (current snapshot)
  const autoCalcs = computeAutoCalcs();

  // Build response: merge auto + manual per category/metric/year
  const response: Record<string, Record<string, Record<number, {
    value: number | null;
    isAuto: boolean;
    isOverride: boolean;
    isForecast: boolean;
  }>>> = {};

  // Seed auto-calcs for current year (2025)
  const currentYear = 2025;
  for (const [category, metrics] of Object.entries(autoCalcs)) {
    if (!response[category]) response[category] = {};
    for (const [metric, value] of Object.entries(metrics)) {
      if (!response[category][metric]) response[category][metric] = {};
      for (const yr of years) {
        response[category][metric][yr] = {
          value: yr === currentYear ? value : null,
          isAuto: yr === currentYear && value !== null,
          isOverride: false,
          isForecast: yr > currentYear,
        };
      }
    }
  }

  // Overlay manual stats
  for (const stat of manualStats) {
    if (!years.includes(stat.year)) continue;
    const cat = stat.category;
    const met = stat.metric;
    if (!response[cat]) response[cat] = {};
    if (!response[cat][met]) response[cat][met] = {};
    response[cat][met][stat.year] = {
      value: stat.value,
      isAuto: false,
      isOverride: stat.isOverride === 1,
      isForecast: stat.isForecast === 1,
    };
  }

  return NextResponse.json({ years, data: response });
}

export async function PUT(req: NextRequest) {
  const { requireFullAccess } = await import("@/lib/auth");
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { category, metric, year, value, isForecast } = body;

  if (!category || !metric || !year) {
    return NextResponse.json({ error: "category, metric, year required" }, { status: 400 });
  }

  // Check if auto-calc exists for this metric
  const autoCalcs = computeAutoCalcs();
  const isOverride = autoCalcs[category]?.[metric] !== undefined ? 1 : 0;

  // Upsert
  const existing = db.select().from(marketStats).where(
    and(
      eq(marketStats.category, category),
      eq(marketStats.metric, metric),
      eq(marketStats.year, year),
    )
  ).get();

  if (existing) {
    db.update(marketStats).set({
      value: value !== null && value !== "" ? Number(value) : null,
      isForecast: isForecast ? 1 : 0,
      isOverride,
      updatedAt: new Date().toISOString(),
    }).where(eq(marketStats.id, existing.id)).run();
  } else {
    db.insert(marketStats).values({
      category,
      metric,
      year,
      value: value !== null && value !== "" ? Number(value) : null,
      isForecast: isForecast ? 1 : 0,
      isOverride,
      updatedAt: new Date().toISOString(),
    }).run();
  }

  return NextResponse.json({ ok: true });
}
