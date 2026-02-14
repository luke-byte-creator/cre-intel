"""
Transfer List Excel Parser
Parses City of Saskatoon property transfer list (Excel/XLSX).
Columns: Roll #, Civic_Address, Vendor, Purchaser, Sales_Date, Sales_Price, PPT, PPT_Descriptor
"""

from typing import Optional, List
import openpyxl
import json
import sys
from datetime import datetime
from pathlib import Path


def parse_transfer_list(xlsx_path: str) -> List[dict]:
    """Parse transfer list Excel file into structured records."""
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb.active

    records = []
    headers = None

    for row in ws.iter_rows(values_only=True):
        # First row is headers
        if headers is None:
            # Take only meaningful columns (first 8)
            headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(row[:8])]
            continue

        # Skip empty rows
        vals = row[:8]
        if not any(vals):
            continue

        roll_number = str(vals[0]) if vals[0] else None
        address = str(vals[1]).strip() if vals[1] else None
        vendor = _clean_name(vals[2])
        purchaser = _clean_name(vals[3])
        sales_date = _format_date(vals[4])
        sales_price = float(vals[5]) if vals[5] else None
        ppt_code = str(vals[6]).strip() if vals[6] else None
        ppt_descriptor = str(vals[7]).strip() if vals[7] else None

        records.append({
            "roll_number": roll_number,
            "address": address,
            "vendor": vendor,
            "purchaser": purchaser,
            "sales_date": sales_date,
            "sales_price": sales_price,
            "property_type_code": ppt_code,
            "property_type": ppt_descriptor,
        })

    wb.close()
    return records


def _clean_name(val) -> Optional[str]:
    """Clean up a company/person name (remove newlines, extra whitespace)."""
    if not val:
        return None
    return " ".join(str(val).split())


def _format_date(val) -> Optional[str]:
    """Format date to ISO string."""
    if not val:
        return None
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    return str(val)


def main():
    if len(sys.argv) < 2:
        print("Usage: python transfer_list.py <xlsx_path> [output.json]")
        sys.exit(1)

    xlsx_path = sys.argv[1]
    records = parse_transfer_list(xlsx_path)

    print(f"Parsed {len(records)} transfer records")

    if len(sys.argv) > 2:
        output_path = sys.argv[2]
        Path(output_path).write_text(json.dumps(records, indent=2))
        print(f"Written to {output_path}")
    else:
        # Print summary
        for r in records[:5]:
            print(json.dumps(r, indent=2))
        if len(records) > 5:
            print(f"... and {len(records) - 5} more")


if __name__ == "__main__":
    main()
