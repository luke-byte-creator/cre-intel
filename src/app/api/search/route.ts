import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { fuzzyMatch } from "@/lib/fuzzy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const type = req.nextUrl.searchParams.get("type") || "all"; // all, companies, people, properties

  const results: Record<string, unknown[]> = {};

  if (type === "all" || type === "companies") {
    const companies = db.select().from(schema.companies).all();
    const matched = fuzzyMatch(companies, q, (c) => [c.name, c.entityNumber || "", c.registeredAddress || ""]);
    results.companies = matched.map((m) => ({ ...m.item, _score: m.score }));
  }

  if (type === "all" || type === "people") {
    const people = db.select().from(schema.people).all();
    const matched = fuzzyMatch(people, q, (p) => [p.fullName, p.address || ""]);
    results.people = matched.map((m) => ({ ...m.item, _score: m.score }));
  }

  if (type === "all" || type === "properties") {
    const properties = db.select().from(schema.properties).all();
    const matched = fuzzyMatch(properties, q, (p) => [p.address || "", p.neighbourhood || "", p.parcelId || ""]);
    results.properties = matched.map((m) => ({ ...m.item, _score: m.score }));
  }

  return NextResponse.json(results);
}
