# Scraper → Production Data Architecture

## Core Principle
**Building inventory is sacred.** Never auto-alter building structure, floors, or total SF.
Scraped data only updates **availability/vacancy layer** on top of existing inventory.

## Data Flow

```
ICR Scrape → scraped_listings (sandbox)
                ↓
        Manual Release (first time)
                ↓
        office_units / industrial_vacancies / suburban_office_listings
                ↓
        Auto-Update (subsequent scrapes)
        - Rate changes → auto-applied + logged
        - SF changes → auto-applied + logged  
        - Disappeared listing → flagged "possibly leased" for review
        - New listing at released address → auto-add + logged
        - New listing at new address → stays in sandbox, needs manual release
```

## Change Tracking (`listing_changes` table)
Every auto-update is logged. Types:
- `rate_change` — asking rent or occupancy cost changed
- `sf_change` — square footage changed
- `new_availability` — new suite appeared at known building
- `possibly_leased` — listing disappeared from source
- `status_change` — listing type or status changed
- `new_listing` — first-time release (manual)

Luke reviews `possibly_leased` flags. All others are informational.

## Schema Additions

### `scraped_listings` — add:
- `occupancy_cost` REAL — additional rent (occ costs + taxes) PSF
- Parsed from description text: "OCCUPANCY COSTS $X.XX PSF"

### `office_units` — add:
- `occupancy_cost` REAL — occ costs PSF

### `industrial_vacancies` — add:
- `occupancy_cost` REAL

### `suburban_office_listings` — add:
- `occupancy_cost` REAL

### `office_buildings` — add:
- `tax_assessed_sf` REAL — from property tax records (separate from total_sf)

### NEW `listing_changes` table:
- `id` INTEGER PK
- `source_table` TEXT — which production table was affected
- `source_record_id` INTEGER — ID in that table
- `scraped_listing_id` INTEGER — which scraped listing triggered this
- `change_type` TEXT — rate_change, sf_change, possibly_leased, new_availability, etc.
- `field` TEXT — which field changed (nullable for possibly_leased)
- `old_value` TEXT
- `new_value` TEXT  
- `status` TEXT — pending_review, reviewed, dismissed (default: reviewed for auto-updates, pending_review for possibly_leased)
- `created_at` TEXT
- `reviewed_at` TEXT
- `reviewed_by` INTEGER

## Release Improvements
1. Pass `suite` from scraped_listing → office_units
2. Dedup: check building_id + suite before insert. If exists, update instead.
3. If suite doesn't exist in building stacking plan, flag for manual review.
4. Parse occupancy_cost from description before saving.

## Auto-Update Logic (runs after each scrape)
For each scraped listing that has `released_to` set:
1. Find the production record by `source_url` match
2. Compare: asking_rent, occupancy_cost, square_feet
3. If changed → update production record + log to listing_changes
4. Update `last_seen` timestamp

For released records whose `source_url` was NOT in current scrape:
1. If last_seen > 14 days ago → flag as `possibly_leased`
2. Don't auto-remove — Luke reviews
