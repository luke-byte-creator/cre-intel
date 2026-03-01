import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { matchListingToBuilding } from "@/lib/utils/address-matcher";

export const dynamic = "force-dynamic";

function getCurrentQuarter(): { quarter: string; quarterLabel: string; year: number } {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const year = now.getFullYear();
  return { quarter: `Q${q}`, quarterLabel: `Q${q} ${year}`, year };
}

interface ReleaseResult {
  listingId: number;
  address: string;
  classification: "downtown_office" | "suburban_office" | "industrial";
  targetTable: string;
  matchedBuilding?: string;
  buildingId?: number;
  inventoryMatch: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { listingIds, action } = body as { listingIds: number[]; action: "release" | "preview" };

    if (!listingIds?.length) {
      return NextResponse.json({ error: "No listing IDs provided" }, { status: 400 });
    }

    // Fetch the listings
    const listings = db
      .select()
      .from(schema.scrapedListings)
      .where(inArray(schema.scrapedListings.id, listingIds))
      .all();

    const results: ReleaseResult[] = [];
    const now = new Date().toISOString();
    const { quarter, quarterLabel, year } = getCurrentQuarter();

    for (const listing of listings) {
      if (listing.releasedTo) {
        results.push({
          listingId: listing.id,
          address: listing.address,
          classification: "suburban_office",
          targetTable: listing.releasedTo,
          inventoryMatch: true,
          error: `Already released to ${listing.releasedTo}`,
        });
        continue;
      }

      if (listing.propertyType === "office") {
        const match = matchListingToBuilding(listing.address);
        if (match) {
          results.push({
            listingId: listing.id,
            address: listing.address,
            classification: "downtown_office",
            targetTable: "office_units",
            matchedBuilding: match.buildingAddress,
            buildingId: match.buildingId,
            inventoryMatch: true,
          });

          if (action === "release") {
            // Dedup: check if unit already exists by sourceRef
            const existingUnit = db.select({ id: schema.officeUnits.id })
              .from(schema.officeUnits)
              .where(eq(schema.officeUnits.sourceRef, listing.sourceUrl))
              .all();
            
            if (existingUnit.length === 0) {
              db.insert(schema.officeUnits).values({
                buildingId: match.buildingId,
                floor: listing.suite || "TBD",
                suite: listing.suite || null,
                areaSF: listing.squareFeet,
                isVacant: 1,
                askingRent: listing.askingRent,
                rentBasis: listing.rentBasis || null,
                occupancyCost: listing.occupancyCost || null,
                firstSeen: listing.firstSeen || now,
                source: "scraper",
                sourceRef: listing.sourceUrl,
                listingBrokerage: listing.brokerageFirm,
                listingAgent: listing.broker,
                lastSeen: listing.lastSeen,
                status: "active",
              }).run();
            } else {
              // Update existing unit
              db.update(schema.officeUnits).set({
                areaSF: listing.squareFeet,
                askingRent: listing.askingRent,
                rentBasis: listing.rentBasis || null,
                occupancyCost: listing.occupancyCost || null,
                lastSeen: listing.lastSeen,
                updatedAt: now,
              }).where(eq(schema.officeUnits.id, existingUnit[0].id)).run();
            }

            db.update(schema.scrapedListings)
              .set({ releasedTo: "office_units", releasedAt: now })
              .where(eq(schema.scrapedListings.id, listing.id))
              .run();
          }
        } else {
          results.push({
            listingId: listing.id,
            address: listing.address,
            classification: "suburban_office",
            targetTable: "suburban_office_listings",
            inventoryMatch: false,
          });

          if (action === "release") {
            // Dedup by sourceUrl
            const existingSub = db.select({ id: schema.suburbanOfficeListings.id })
              .from(schema.suburbanOfficeListings)
              .where(eq(schema.suburbanOfficeListings.sourceUrl, listing.sourceUrl))
              .all();
            
            if (existingSub.length === 0) {
              db.insert(schema.suburbanOfficeListings).values({
                address: listing.address,
                suite: listing.suite || null,
                squareFeet: listing.squareFeet,
                askingRent: listing.askingRent,
                rentBasis: listing.rentBasis || null,
                occupancyCost: listing.occupancyCost || null,
                askingPrice: listing.askingPrice,
                listingType: listing.listingType,
                broker: listing.broker,
                brokerageFirm: listing.brokerageFirm,
                source: listing.source,
                sourceUrl: listing.sourceUrl,
                sourceListingId: listing.id,
                status: "active",
                firstSeen: listing.firstSeen,
                lastSeen: listing.lastSeen,
              }).run();
            } else {
              db.update(schema.suburbanOfficeListings).set({
                askingRent: listing.askingRent,
                occupancyCost: listing.occupancyCost || null,
                askingPrice: listing.askingPrice,
                lastSeen: listing.lastSeen,
                updatedAt: now,
              }).where(eq(schema.suburbanOfficeListings.id, existingSub[0].id)).run();
            }

            db.update(schema.scrapedListings)
              .set({ releasedTo: "suburban_office", releasedAt: now })
              .where(eq(schema.scrapedListings.id, listing.id))
              .run();
          }
        }
      } else if (listing.propertyType === "industrial") {
        // Check if this address exists in our industrial inventory
        const normalizedAddr = listing.address.toLowerCase().replace(/,?\s*(saskatoon|sk|s\d\w\s?\d\w\d).*/i, "").trim();
        const existingVacancy = db.select({ id: schema.industrialVacancies.id })
          .from(schema.industrialVacancies)
          .where(eq(schema.industrialVacancies.address, listing.address))
          .get();
        // Also try a loose match on normalized address
        const allVacancies = db.select({ id: schema.industrialVacancies.id, address: schema.industrialVacancies.address })
          .from(schema.industrialVacancies).all();
        const looseMatch = !existingVacancy && allVacancies.find(v => 
          v.address.toLowerCase().replace(/,?\s*(saskatoon|sk|s\d\w\s?\d\w\d).*/i, "").trim() === normalizedAddr
        );
        const hasInventoryMatch = !!(existingVacancy || looseMatch);

        results.push({
          listingId: listing.id,
          address: listing.address,
          classification: "industrial",
          targetTable: "industrial_vacancies",
          inventoryMatch: hasInventoryMatch,
        });

        if (action === "release") {
          // Dedup by source URL
          const existingInd = listing.sourceUrl ? db.select({ id: schema.industrialVacancies.id })
            .from(schema.industrialVacancies)
            .where(eq(schema.industrialVacancies.sourceUrl, listing.sourceUrl))
            .all() : [];
          
          if (existingInd.length === 0) {
            db.insert(schema.industrialVacancies).values({
              address: listing.address,
              availableSF: listing.squareFeet ? Number(listing.squareFeet) : null,
              askingRent: listing.askingRent,
              rentBasis: listing.rentBasis || null,
              occupancyCost: listing.occupancyCost || null,
              sourceUrl: listing.sourceUrl,
              listingBrokerage: listing.brokerageFirm,
              listingType: listing.listingType,
              quarterRecorded: quarterLabel,
              yearRecorded: year,
              firstSeen: listing.firstSeen || now,
              lastSeen: listing.lastSeen || now,
              notes: `Source: ${listing.source} | Broker: ${listing.broker || "N/A"}`,
            }).run();
          } else {
            db.update(schema.industrialVacancies).set({
              availableSF: listing.squareFeet ? Number(listing.squareFeet) : null,
              askingRent: listing.askingRent,
              occupancyCost: listing.occupancyCost || null,
              lastSeen: listing.lastSeen || now,
              updatedAt: now,
            }).where(eq(schema.industrialVacancies.id, existingInd[0].id)).run();
          }

          db.update(schema.scrapedListings)
            .set({ releasedTo: "industrial_vacancies", releasedAt: now })
            .where(eq(schema.scrapedListings.id, listing.id))
            .run();
        }
      } else {
        results.push({
          listingId: listing.id,
          address: listing.address,
          classification: "suburban_office",
          targetTable: "unknown",
          inventoryMatch: false,
          error: `Unsupported property type: ${listing.propertyType}`,
        });
      }
    }

    const counts = {
      downtown: results.filter((r) => r.classification === "downtown_office").length,
      suburban: results.filter((r) => r.classification === "suburban_office" && !r.error).length,
      industrial: results.filter((r) => r.classification === "industrial").length,
      errors: results.filter((r) => r.error).length,
    };

    return NextResponse.json({ results, counts, action });
  } catch (error) {
    console.error("Release error:", error);
    return NextResponse.json({ error: "Failed to process release" }, { status: 500 });
  }
}
