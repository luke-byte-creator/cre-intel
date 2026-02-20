import { NextRequest, NextResponse } from "next/server";
import { db, rawDb, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending_review";
  const changeType = searchParams.get("changeType");

  let query = `
    SELECT 
      lc.id, lc.source_table as sourceTable, lc.source_record_id as sourceRecordId,
      lc.scraped_listing_id as scrapedListingId, lc.change_type as changeType,
      lc.field, lc.old_value as oldValue, lc.new_value as newValue,
      lc.status, lc.created_at as createdAt, lc.reviewed_at as reviewedAt,
      COALESCE(sl.address, '') as address, COALESCE(sl.source, '') as source, sl.suite
    FROM listing_changes lc
    LEFT JOIN scraped_listings sl ON sl.id = lc.scraped_listing_id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (status !== "all") {
    query += ` AND lc.status = ?`;
    params.push(status);
  }
  if (changeType) {
    query += ` AND lc.change_type = ?`;
    params.push(changeType);
  }

  query += ` ORDER BY lc.created_at DESC LIMIT 200`;

  const rows = rawDb.prepare(query).all(...params);

  const pendingCount = rawDb.prepare(
    `SELECT COUNT(*) as count FROM listing_changes WHERE status = 'pending_review'`
  ).get() as { count: number };

  return NextResponse.json({
    changes: rows,
    pendingCount: pendingCount.count,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status, action } = body as { id: number; status?: "reviewed" | "dismissed"; action?: "confirm_leased" };

  if (!id || (!status && action !== "confirm_leased")) {
    return NextResponse.json({ error: "id and status (or action) required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (action === "confirm_leased") {
    // Get the change record to find the source listing
    const change = db.select().from(schema.listingChanges)
      .where(eq(schema.listingChanges.id, id)).get();
    
    if (!change) {
      return NextResponse.json({ error: "Change not found" }, { status: 404 });
    }

    // Mark the change as reviewed
    db.update(schema.listingChanges)
      .set({ status: "reviewed", reviewedAt: now })
      .where(eq(schema.listingChanges.id, id))
      .run();

    // Update the source record status based on which table it's in
    if (change.sourceTable === "office_units") {
      db.update(schema.officeUnits)
        .set({ status: "absorbed", isVacant: 0, updatedAt: now })
        .where(eq(schema.officeUnits.id, change.sourceRecordId))
        .run();
    } else if (change.sourceTable === "industrial_vacancies") {
      // industrial_vacancies has no status column; update notes to flag as leased
      db.update(schema.industrialVacancies)
        .set({ notes: "LEASED", updatedAt: now })
        .where(eq(schema.industrialVacancies.id, change.sourceRecordId))
        .run();
    } else if (change.sourceTable === "suburban_office_listings") {
      db.update(schema.suburbanOfficeListings)
        .set({ status: "leased", updatedAt: now })
        .where(eq(schema.suburbanOfficeListings.id, change.sourceRecordId))
        .run();
    }

    // Also mark the scraped listing as inactive if we have it
    if (change.scrapedListingId) {
      db.update(schema.scrapedListings)
        .set({ status: "leased", updatedAt: now })
        .where(eq(schema.scrapedListings.id, change.scrapedListingId))
        .run();
    }

    return NextResponse.json({ success: true, action: "confirm_leased" });
  }

  db.update(schema.listingChanges)
    .set({ status: status!, reviewedAt: now })
    .where(eq(schema.listingChanges.id, id))
    .run();

  return NextResponse.json({ success: true });
}
