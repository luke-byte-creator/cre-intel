import XLSX from "xlsx";
import path from "path";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

function inferStatus(comment: string | null): string {
  if (!comment) return "active";
  const c = comment.toLowerCase();
  if (c.includes("out of business") || c.includes("closed") || c.includes("out of busi")) return "closed";
  if (c.includes("site rejected") || c.includes("rejected") || c.includes("no interest") || c.includes("denied")) return "rejected";
  if (c.includes("presented") || c.includes("pursuing") || c.includes("pending")) return "prospect";
  return "active";
}

// Rough area mapping based on development name
function inferArea(devName: string): string {
  const n = devName.toLowerCase();
  if (n.includes("west") || n.includes("brighton") || n.includes("kensington")) return "West";
  if (n.includes("stonebridge") || n.includes("ancillary")) return "South";
  if (n.includes("university") || n.includes("preston")) return "East";
  if (n.includes("flats")) return "Central";
  return "Other";
}

export async function seedRetail() {
  console.log("Seeding retail tenants...");

  const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(schema.retailDevelopments).all();
  if (count > 0) {
    console.log(`  Already have ${count} retail developments, skipping`);
    return;
  }

  const filePath = path.join(process.env.HOME || "", "Documents/Nova/Retail/Saskatoon Retail Tenant Overview.xlsx");
  const wb = XLSX.readFile(filePath);
  const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

  // Known development headers that start sections with numbered tenants
  const devHeaders = new Set([
    "Saskatoon West", "Brighton", "Shops at South Kensington",
    "Stonebridge Smartcentres", "University Heights", "Preston Crossing",
    "Stonebridge Common", "Ancillary Retail Surrounding Stonebridge Common", "The Flats",
  ]);

  interface Dev { name: string; tenants: { name: string; comment: string | null; order: number }[] }
  const developments: Dev[] = [];
  let current: Dev | null = null;
  let tenantOrder = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as (string | number | null)[];
    if (!row || !row[0]) continue;
    const val = String(row[0]).trim();

    const match = val.match(/^(\d+)\.\s+(.+)/);
    if (match) {
      if (current) {
        tenantOrder++;
        current.tenants.push({ name: match[2].trim(), comment: row[1] ? String(row[1]).trim() : null, order: tenantOrder });
      }
    } else if (val.length > 2) {
      // Check if this is a development header
      let hasNumbered = false;
      for (let j = i + 1; j < Math.min(i + 5, data.length); j++) {
        if (data[j] && (data[j] as string[])[0] && String((data[j] as string[])[0]).match(/^\d+\./)) { hasNumbered = true; break; }
      }
      if (hasNumbered || devHeaders.has(val)) {
        if (current) developments.push(current);
        current = { name: val, tenants: [] };
        tenantOrder = 0;
      } else if (current) {
        tenantOrder++;
        current.tenants.push({ name: val, comment: row[1] ? String(row[1]).trim() : null, order: tenantOrder });
      }
    }
  }
  if (current) developments.push(current);

  // Deduplicate and merge
  const devMap = new Map<string, Dev>();
  for (const d of developments) {
    if (d.tenants.length === 0) continue;
    if (devMap.has(d.name)) {
      devMap.get(d.name)!.tenants.push(...d.tenants);
    } else {
      devMap.set(d.name, { ...d });
    }
  }
  const uniqueDevs = Array.from(devMap.values());

  let totalTenants = 0;
  let devOrder = 0;
  for (const dev of uniqueDevs) {
    devOrder++;
    db.insert(schema.retailDevelopments).values({
      name: dev.name,
      area: inferArea(dev.name),
      sortOrder: devOrder,
    }).run();

    const [inserted] = db.select({ id: schema.retailDevelopments.id }).from(schema.retailDevelopments)
      .where(sql`${schema.retailDevelopments.name} = ${dev.name}`).all();

    for (const t of dev.tenants) {
      db.insert(schema.retailTenants).values({
        developmentId: inserted.id,
        tenantName: t.name,
        comment: t.comment,
        status: inferStatus(t.comment),
        sortOrder: t.order,
      }).run();
      totalTenants++;
    }
    console.log(`  ${dev.name}: ${dev.tenants.length} tenants`);
  }

  console.log(`  Total: ${uniqueDevs.length} developments, ${totalTenants} tenants`);
}
