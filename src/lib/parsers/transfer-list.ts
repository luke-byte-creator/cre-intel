/**
 * Transfer List Excel Parser (TypeScript)
 * Parses City of Saskatoon property transfer list (XLSX).
 */

import * as XLSX from "xlsx";

export interface TransferRecord {
  rollNumber: string | null;
  address: string | null;
  vendor: string | null;
  purchaser: string | null;
  salesDate: string | null;
  salesPrice: number | null;
  propertyTypeCode: string | null;
  propertyType: string | null;
}

function cleanName(val: unknown): string | null {
  if (!val) return null;
  return String(val).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel serial date number
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  if (val instanceof Date) {
    return val.toISOString().split("T")[0];
  }
  return String(val);
}

export function parseTransferList(buffer: Buffer | Uint8Array): TransferRecord[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const records: TransferRecord[] = [];
  // First row is headers, skip it
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length || !row.some((v) => v != null && v !== "")) continue;

    records.push({
      rollNumber: row[0] != null ? String(row[0]) : null,
      address: row[1] != null ? String(row[1]).trim() : null,
      vendor: cleanName(row[2]),
      purchaser: cleanName(row[3]),
      salesDate: formatDate(row[4]),
      salesPrice: row[5] != null ? Number(row[5]) : null,
      propertyTypeCode: row[6] != null ? String(row[6]).trim() : null,
      propertyType: row[7] != null ? String(row[7]).trim() : null,
    });
  }

  return records;
}
