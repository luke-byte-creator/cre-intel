"""
Building Permit PDF Parser
Parses City of Saskatoon weekly building permit reports (PDF).
Filters to commercial permits (COMM- prefix) with value > $350,000 only.
"""

from typing import Optional, List
import pdfplumber
import re
import json
import sys
from pathlib import Path


def parse_building_permits(pdf_path: str, min_value: float = 350_000) -> List[dict]:
    """Parse building permit PDF, returning only commercial permits above min_value."""
    permits = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            text = page.extract_text()
            if not text:
                continue

            # Extract week date range from header if present
            week_match = re.search(r"First Day:\s*(.+?)\n.*?Last Day:\s*(.+?)(?:\n|$)", text)

            # Split into permit blocks - each starts with a BP number pattern
            # Permit patterns: ACC-, COMM-, DECK-, DEMO-, HALT-, INST-, MFR-, SFD-, SIGN-, etc.
            blocks = re.split(r"(?=(?:ACC|COMM|DECK|DEMO|HALT|INST|MFR|SFD|SIGN|TENT|PLUMB|FIRE|MOVE)-\d{4}-\d+)", text)

            for block in blocks:
                block = block.strip()
                if not block:
                    continue

                # Only process COMM permits
                if not block.startswith("COMM-"):
                    continue

                permit = _parse_permit_block(block, page_num)
                if permit and permit.get("value") and permit["value"] >= min_value:
                    permits.append(permit)

    return permits


def _parse_permit_block(block: str, page_num: int) -> Optional[dict]:
    """Parse a single permit text block into structured data."""
    lines = block.split("\n")
    if not lines:
        return None

    # Extract permit number
    bp_match = re.match(r"(COMM-\d{4}-\d+)", lines[0])
    if not bp_match:
        return None

    permit_number = bp_match.group(1)

    # Extract issue date (M/D/YYYY format)
    date_match = re.search(r"(\d{1,2}/\d{1,2}/\d{4})", block)
    issue_date = None
    if date_match:
        parts = date_match.group(1).split("/")
        issue_date = f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"

    # Extract value ($XXX,XXX or $XXX format at end of lines)
    value = None
    value_match = re.search(r"\$([0-9,]+)\s*$", block, re.MULTILINE)
    if value_match:
        value = float(value_match.group(1).replace(",", ""))

    # Extract address - look for street patterns in the block
    address = None
    # Try multiple patterns for address extraction
    addr_patterns = [
        # Standard: 123 Street Name TYPE [DIR] [#unit], Saskatoon, SK
        r"(\d+\s+(?:\d+\s+)?[A-Za-z][A-Za-z\s]+?(?:AVE|ST|DR|RD|BLVD|CRES|PL|WAY|LANE|CRT|TERR|PKWY|HWY|CIRCLE|MANOR|MEWS|TRAIL|GATE)\s*[NSEW]?\s*(?:#\s*\d+)?),?\s*\n?\s*Saskatoon,?\s*SK",
        # With unit: 123 Street #456, Saskatoon
        r"(\d+\s+[A-Za-z][A-Za-z\s]+?(?:AVE|ST|DR|RD|BLVD|CRES)\s*[NSEW]?\s*#\d+),?\s*\n?\s*Saskatoon",
    ]
    for pattern in addr_patterns:
        addr_match = re.search(pattern, block, re.IGNORECASE)
        if addr_match:
            address = re.sub(r"\s+", " ", addr_match.group(0)).strip()
            # Clean trailing comma
            address = address.rstrip(",").strip()
            break

    # Extract scope of work / description
    scope = None
    scope_match = re.search(r"(Commercial Building|Commercial)\n(.+?)(?:\n|$)", block)
    if scope_match:
        building_type = scope_match.group(1)
        # Collect description lines after building type
        desc_lines = []
        found = False
        for line in lines:
            if "Commercial" in line and not found:
                found = True
                if line.strip() != "Commercial Building" and line.strip() != "Commercial":
                    desc_lines.append(line.strip())
                continue
            if found:
                # Stop at dollar value or next permit
                if re.match(r"\$|(?:ACC|COMM|DECK|DEMO)-", line.strip()):
                    break
                if line.strip():
                    desc_lines.append(line.strip())
        scope = " - ".join(desc_lines) if desc_lines else None

    # Extract owner/applicant - from the text between date and address
    # The PDF has Owner/Address and Contractor/Address columns side by side
    # Owner appears first after the date
    owner = _extract_owner(block, date_match.end() if date_match else 0)
    # Clean up duplicated owner names (PDF column merge artifact)
    if owner:
        owner = _dedup_owner(owner)

    # Extract work type
    work_type = None
    if "New" in block and "New" in block.split("\n"):
        work_type = "New Construction"
    elif "Alteration/Renovation" in block:
        work_type = "Alteration/Renovation"
    elif "Demolition" in block:
        work_type = "Demolition"

    return {
        "permit_number": permit_number,
        "issue_date": issue_date,
        "address": address,
        "owner": owner,
        "scope": scope,
        "work_type": work_type,
        "building_type": "Commercial",
        "value": value,
        "page": page_num,
    }


def _dedup_owner(name: str) -> str:
    """Fix duplicated owner names from PDF column merge (e.g. 'Wright Construction Wright Co' -> 'Wright Construction')."""
    words = name.split()
    n = len(words)
    # Check if second half repeats first word(s)
    for split in range(2, n):
        first_part = " ".join(words[:split])
        second_part = " ".join(words[split:])
        # If the second part starts with a word from the first part, it's likely a dupe
        if words[split] == words[0] or (len(words[split]) > 3 and words[split] in first_part):
            return first_part
    return name


def _extract_owner(block: str, start_pos: int) -> Optional[str]:
    """Try to extract owner/applicant name from permit block."""
    # Owner is typically the first entity name after the date
    # Look for company-like names (words with Inc, Ltd, Corp, etc.)
    text_after_date = block[start_pos:]
    # Try to find company name patterns
    company_match = re.search(
        r"([A-Z][A-Za-z\s&\-']+(?:Inc|Ltd|Corp|Co|LP|LLP|Group|Properties|Investments|Construction|Development|Developments|Holdings|Realty|Real Estate|Partnership|Trust|Association)\.?(?:\s+(?:Inc|Ltd|Corp)\.?)?)",
        text_after_date
    )
    if company_match:
        return company_match.group(1).strip()
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python building_permits.py <pdf_path> [output.json] [--min-value=350000]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    min_value = 350_000

    # Check for --min-value flag
    for arg in sys.argv[2:]:
        if arg.startswith("--min-value="):
            min_value = float(arg.split("=")[1])

    permits = parse_building_permits(pdf_path, min_value)
    print(f"Found {len(permits)} commercial permits >= ${min_value:,.0f}")

    output_path = None
    for arg in sys.argv[2:]:
        if not arg.startswith("--"):
            output_path = arg
            break

    if output_path:
        Path(output_path).write_text(json.dumps(permits, indent=2))
        print(f"Written to {output_path}")
    else:
        for p in permits:
            print(json.dumps(p, indent=2))


if __name__ == "__main__":
    main()
