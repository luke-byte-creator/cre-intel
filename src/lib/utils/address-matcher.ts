/**
 * Address matching utility for classifying office listings as downtown vs suburban
 * by matching against the office_buildings table.
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const ABBREVIATIONS: Record<string, string> = {
  ave: "avenue",
  st: "street",
  dr: "drive",
  rd: "road",
  blvd: "boulevard",
  cres: "crescent",
  cr: "crescent",
  pl: "place",
  ct: "court",
  crt: "court",
  ln: "lane",
  way: "way",
  hwy: "highway",
  pk: "park",
  cir: "circle",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
};

export function normalizeAddress(raw: string): { streetNumber: string; streetName: string; normalized: string } | null {
  if (!raw) return null;

  // Strip city/province suffix
  let addr = raw
    .replace(/,?\s*saskatoon\s*,?\s*(sk|saskatchewan)?/i, "")
    .replace(/,?\s*(sk|saskatchewan)\s*$/i, "")
    .trim();

  // Extract street number
  const numMatch = addr.match(/^(\d+)\s+(.+)$/);
  if (!numMatch) return null;

  const streetNumber = numMatch[1];
  let streetName = numMatch[2].toLowerCase().trim();

  // Remove unit/suite info
  streetName = streetName.replace(/\s*(suite|unit|#)\s*\d+.*/i, "").trim();

  // Expand abbreviations
  streetName = streetName
    .split(/\s+/)
    .map((w) => ABBREVIATIONS[w.replace(/\.$/, "")] || w.replace(/\.$/, ""))
    .join(" ");

  return {
    streetNumber,
    streetName,
    normalized: `${streetNumber} ${streetName}`,
  };
}

function normalizeOfficeBuildingAddress(streetNumber: string | null, address: string): string {
  if (!streetNumber || !address) return "";
  const streetName = address
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((w) => ABBREVIATIONS[w.replace(/\.$/, "")] || w.replace(/\.$/, ""))
    .join(" ");
  return `${streetNumber} ${streetName}`;
}

interface ClassifiedListing {
  listing: typeof schema.scrapedListings.$inferSelect;
  buildingId?: number;
  buildingAddress?: string;
}

export function classifyOfficeListings(): {
  downtown: ClassifiedListing[];
  suburban: ClassifiedListing[];
} {
  // Get all office buildings
  const buildings = db
    .select()
    .from(schema.officeBuildings)
    .all();

  // Build lookup: normalized address → building
  const buildingMap = new Map<string, { id: number; address: string }>();
  for (const b of buildings) {
    const norm = normalizeOfficeBuildingAddress(b.streetNumber, b.address);
    if (norm) buildingMap.set(norm, { id: b.id, address: `${b.streetNumber || ""} ${b.address}`.trim() });
  }

  // Get active office listings that haven't been released
  const listings = db
    .select()
    .from(schema.scrapedListings)
    .where(eq(schema.scrapedListings.propertyType, "office"))
    .all()
    .filter((l) => l.status === "active" && !l.releasedTo);

  const downtown: ClassifiedListing[] = [];
  const suburban: ClassifiedListing[] = [];

  for (const listing of listings) {
    const parsed = normalizeAddress(listing.address);
    if (!parsed) {
      suburban.push({ listing });
      continue;
    }

    const match = buildingMap.get(parsed.normalized);
    if (match) {
      downtown.push({ listing, buildingId: match.id, buildingAddress: match.address });
    } else {
      suburban.push({ listing });
    }
  }

  return { downtown, suburban };
}

/**
 * Match a single listing address against office buildings.
 * Returns buildingId if matched, null otherwise.
 */
export function matchListingToBuilding(address: string): { buildingId: number; buildingAddress: string } | null {
  const parsed = normalizeAddress(address);
  if (!parsed) return null;

  const buildings = db
    .select()
    .from(schema.officeBuildings)
    .all();

  for (const b of buildings) {
    const norm = normalizeOfficeBuildingAddress(b.streetNumber, b.address);
    if (norm && norm === parsed.normalized) {
      return { buildingId: b.id, buildingAddress: `${b.streetNumber || ""} ${b.address}`.trim() };
    }
  }

  return null;
}
