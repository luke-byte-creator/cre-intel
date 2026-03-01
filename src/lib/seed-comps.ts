import { db, schema } from "@/db";
import { parseCompfolio, CompRecord } from "./parsers/comps-compfolio";
import { parseTransfer2018 } from "./parsers/comps-transfer-2018";
import { parseTransfer2023 } from "./parsers/comps-transfer-2023";
import { sql } from "drizzle-orm";
import path from "path";

const TX_DIR = "/Users/lukejansen/Documents/Nova/Transactions";

function normalizeAddr(a: string): string {
  return a.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function dateDiffDays(a: string | null, b: string | null): number {
  if (!a || !b) return Infinity;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

export async function seedComps() {
  console.log("Parsing CompFolio CSV...");
  const compfolio = parseCompfolio(path.join(TX_DIR, "Lease & Sale Data.csv"));
  console.log(`  CompFolio: ${compfolio.length} records`);

  console.log("Parsing Transfer 2018-2022...");
  const t2018 = parseTransfer2018(path.join(TX_DIR, "Transfer List 2018-2022.xlsx"));
  console.log(`  Transfer 2018-2022: ${t2018.length} records`);

  console.log("Parsing Transfer 2023-2025...");
  const t2023 = parseTransfer2023(path.join(TX_DIR, "Transfer List 2023 - 2025.xlsx"));
  console.log(`  Transfer 2023-2025: ${t2023.length} records`);

  // Deduplicate: CompFolio wins over transfer list for matching records
  const compfolioByAddr = new Map<string, CompRecord[]>();
  for (const rec of compfolio) {
    const key = normalizeAddr(rec.address);
    if (!compfolioByAddr.has(key)) compfolioByAddr.set(key, []);
    compfolioByAddr.get(key)!.push(rec);
  }

  let dupes = 0;
  const transferKeep: CompRecord[] = [];

  for (const rec of [...t2018, ...t2023]) {
    const key = normalizeAddr(rec.address);
    const cfMatches = compfolioByAddr.get(key);
    if (cfMatches && rec.type === "Sale") {
      const isDupe = cfMatches.some(
        cf => cf.type === "Sale" && dateDiffDays(cf.saleDate, rec.saleDate) < 60
      );
      if (isDupe) { dupes++; continue; }
    }
    transferKeep.push(rec);
  }

  const all = [...compfolio, ...transferKeep];
  console.log(`  Duplicates removed: ${dupes}`);
  console.log(`  Total to insert: ${all.length}`);

  // Clear and insert
  db.run(sql`DELETE FROM ${schema.comps}`);

  const batchSize = 100;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    await db.insert(schema.comps).values(
      batch.map(r => ({
        type: r.type,
        propertyType: r.propertyType,
        investmentType: r.investmentType,
        leaseType: r.leaseType,
        propertyName: r.propertyName,
        address: r.address,
        unit: r.unit,
        city: r.city || "Saskatoon",
        province: r.province || "Saskatchewan",
        seller: r.seller,
        purchaser: r.purchaser,
        landlord: r.landlord,
        tenant: r.tenant,
        portfolio: r.portfolio,
        saleDate: r.saleDate,
        salePrice: r.salePrice,
        pricePSF: r.pricePSF,
        pricePerAcre: r.pricePerAcre,
        isRenewal: r.isRenewal,
        leaseStart: r.leaseStart,
        leaseExpiry: r.leaseExpiry,
        termMonths: r.termMonths,
        netRentPSF: r.netRentPSF,
        annualRent: r.annualRent,
        rentSteps: r.rentSteps,
        areaSF: r.areaSF,
        officeSF: r.officeSF,
        ceilingHeight: r.ceilingHeight,
        loadingDocks: r.loadingDocks,
        driveInDoors: r.driveInDoors,
        landAcres: r.landAcres,
        landSF: r.landSF,
        yearBuilt: r.yearBuilt,
        zoning: r.zoning,
        noi: r.noi,
        capRate: r.capRate,
        stabilizedNOI: r.stabilizedNOI,
        stabilizedCapRate: r.stabilizedCapRate,
        vacancyRate: r.vacancyRate,
        pricePerUnit: r.pricePerUnit,
        opexRatio: r.opexRatio,
        numUnits: r.numUnits,
        numBuildings: r.numBuildings,
        numStories: r.numStories,
        constructionClass: r.constructionClass,
        retailSalesPerAnnum: r.retailSalesPerAnnum,
        retailSalesPSF: r.retailSalesPSF,
        operatingCost: r.operatingCost,
        improvementAllowance: r.improvementAllowance,
        freeRentPeriod: r.freeRentPeriod,
        fixturingPeriod: r.fixturingPeriod,
        comments: r.comments,
        source: r.source,
        rollNumber: r.rollNumber,
        pptCode: r.pptCode,
        pptDescriptor: r.pptDescriptor,
        armsLength: r.armsLength,
      }))
    );
  }

  // Summary
  const sales = all.filter(r => r.type === "Sale").length;
  const leases = all.filter(r => r.type === "Lease").length;
  console.log(`\nSeed complete: ${sales} sales, ${leases} leases, ${all.length} total`);
  console.log(`  CompFolio: ${compfolio.length}`);
  console.log(`  Transfer 2018-2022 kept: ${transferKeep.filter(r => r.source === "transfer-2018-2022").length}`);
  console.log(`  Transfer 2023-2025 kept: ${transferKeep.filter(r => r.source === "transfer-2023-2025").length}`);
}
