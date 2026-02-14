import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { fuzzyMatch } from "@/lib/fuzzy";
import { eq, or, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const q = req.nextUrl.searchParams.get("q") || "";
  const type = req.nextUrl.searchParams.get("type") || "all";

  const results: Record<string, unknown[]> = {};

  if (type === "all" || type === "companies") {
    const companies = db.select().from(schema.companies).all();
    const matched = fuzzyMatch(companies, q, (c) => [c.name, c.entityNumber || "", c.registeredAddress || ""]);

    if (matched.length > 0) {
      const matchedIds = matched.map((m) => m.item.id);

      // Batch: get first director for all matched companies
      const directors = db
        .select({
          companyId: schema.companyPeople.companyId,
          fullName: schema.people.fullName,
          title: schema.companyPeople.title,
        })
        .from(schema.companyPeople)
        .innerJoin(schema.people, eq(schema.companyPeople.personId, schema.people.id))
        .where(eq(schema.companyPeople.role, "Director"))
        .all();

      // Group by companyId, take first per company
      const directorMap = new Map<number, { fullName: string; title: string | null }>();
      for (const d of directors) {
        if (!directorMap.has(d.companyId)) {
          directorMap.set(d.companyId, { fullName: d.fullName, title: d.title });
        }
      }

      // Batch: get latest transaction for all matched companies
      const txRows = db
        .select({
          id: schema.transactions.id,
          transferDate: schema.transactions.transferDate,
          price: schema.transactions.price,
          grantorCompanyId: schema.transactions.grantorCompanyId,
          granteeCompanyId: schema.transactions.granteeCompanyId,
        })
        .from(schema.transactions)
        .where(
          or(
            sql`${schema.transactions.grantorCompanyId} IN (${sql.raw(matchedIds.join(","))})`,
            sql`${schema.transactions.granteeCompanyId} IN (${sql.raw(matchedIds.join(","))})`
          )
        )
        .orderBy(sql`transfer_date DESC`)
        .all();

      // Group by company, take latest
      const lastMoveMap = new Map<number, { type: string; date: string | null; price: number | null }>();
      for (const tx of txRows) {
        for (const cid of [tx.grantorCompanyId, tx.granteeCompanyId]) {
          if (cid && matchedIds.includes(cid) && !lastMoveMap.has(cid)) {
            lastMoveMap.set(cid, {
              type: tx.granteeCompanyId === cid ? "Purchase" : "Sale",
              date: tx.transferDate,
              price: tx.price,
            });
          }
        }
      }

      results.companies = matched.map((m) => {
        const dir = directorMap.get(m.item.id);
        const lastMove = lastMoveMap.get(m.item.id);
        return {
          ...m.item,
          _score: m.score,
          director: dir ? `${dir.fullName}${dir.title ? ` (${dir.title})` : ""}` : null,
          lastMove: lastMove || null,
        };
      });
    } else {
      results.companies = [];
    }
  }

  if (type === "all" || type === "people") {
    const people = db.select().from(schema.people).all();
    const matched = fuzzyMatch(people, q, (p) => [p.fullName, p.address || ""]);

    if (matched.length > 0) {
      const matchedIds = matched.map((m) => m.item.id);

      // Batch: get company associations for all matched people
      const associations = db
        .select({
          personId: schema.companyPeople.personId,
          companyName: schema.companies.name,
        })
        .from(schema.companyPeople)
        .innerJoin(schema.companies, eq(schema.companyPeople.companyId, schema.companies.id))
        .where(sql`${schema.companyPeople.personId} IN (${sql.raw(matchedIds.join(","))})`)
        .all();

      const companyMap = new Map<number, string>();
      for (const a of associations) {
        if (!companyMap.has(a.personId)) {
          companyMap.set(a.personId, a.companyName);
        }
      }

      results.people = matched.map((m) => ({
        ...m.item,
        _score: m.score,
        companyName: companyMap.get(m.item.id) || null,
      }));
    } else {
      results.people = [];
    }
  }

  if (type === "all" || type === "properties") {
    const properties = db.select().from(schema.properties).all();
    const matched = fuzzyMatch(properties, q, (p) => [p.address || "", p.neighbourhood || "", p.parcelId || ""]);
    results.properties = matched.map((m) => ({ ...m.item, _score: m.score }));
  }

  return NextResponse.json(results);
}
