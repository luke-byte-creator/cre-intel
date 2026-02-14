"""
Corporate Registry PDF Parser
Parses Saskatchewan corporate registry profile reports exported as PDF.
Uses pdfplumber to extract text, then regex to parse structured fields.
"""

import pdfplumber
import re
import json
import sys
from pathlib import Path


def parse_corporate_registry(pdf_path: str) -> dict:
    """Parse a Saskatchewan corporate registry PDF into structured data."""
    with pdfplumber.open(pdf_path) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    result = {
        "entity_number": None,
        "entity_name": None,
        "report_date": None,
        "entity_type": None,
        "entity_subtype": None,
        "status": None,
        "incorporation_date": None,
        "annual_return_due": None,
        "nature_of_business": None,
        "registered_address": None,
        "mailing_address": None,
        "directors": [],
        "officers": [],
        "shareholders": [],
        "share_structure": [],
        "event_history": [],
        "raw_text": full_text,
    }

    # Entity number
    m = re.search(r"EntityNumber:\s*(\S+)", full_text)
    if m:
        result["entity_number"] = m.group(1)

    # Entity name
    m = re.search(r"EntityName:\s*(.+?)(?:\s+ReportDate:)", full_text)
    if m:
        result["entity_name"] = m.group(1).strip()

    # Report date
    m = re.search(r"ReportDate:\s*(\S+)", full_text)
    if m:
        result["report_date"] = m.group(1)

    # Entity details
    for field, key in [
        ("EntityType", "entity_type"),
        ("EntitySubtype", "entity_subtype"),
        ("EntityStatus", "status"),
        ("IncorporationDate", "incorporation_date"),
        ("AnnualReturnDueDate", "annual_return_due"),
        ("NatureofBusiness", "nature_of_business"),
    ]:
        m = re.search(rf"{field}\s+(.+?)(?:\n|$)", full_text)
        if m:
            result[key] = m.group(1).strip()

    # Registered address
    m = re.search(r"PhysicalAddress\s+(.+?)(?:\n|MailingAddress)", full_text, re.DOTALL)
    if m:
        result["registered_address"] = re.sub(r"\s+", " ", m.group(1)).strip()

    # Mailing address (first occurrence under RegisteredOfficeAddresses)
    m = re.search(r"RegisteredOfficeAddresses.*?MailingAddress\s+(.+?)(?:\n[A-Z])", full_text, re.DOTALL)
    if m:
        result["mailing_address"] = re.sub(r"\s+", " ", m.group(1)).strip()

    # Directors and Officers
    # Pattern: NAME (Role)  EffectiveDate: DATE
    director_section = re.search(r"Directors/Officers\n(.*?)(?:Shareholders|Articles|$)", full_text, re.DOTALL)
    if director_section:
        section = director_section.group(1)
        # Find all entries like: TRAVIS BATTING(Director) EffectiveDate: 28-Mar-2022
        entries = re.finditer(
            r"([A-Z][A-Z\s]+?)\((Director|Officer)\)\s+EffectiveDate:\s*(\S+)"
            r"(?:.*?PhysicalAddress:\s*(.*?)(?:MailingAddress:|$))?"
            r"(?:.*?OfficeHeld:\s*([A-Z]+))?" ,
            section,
            re.DOTALL
        )
        for entry in entries:
            name = entry.group(1).strip()
            role = entry.group(2)
            effective_date = entry.group(3)
            address = re.sub(r"\s+", " ", entry.group(4).strip()) if entry.group(4) else None
            title = entry.group(5) if entry.group(5) else None

            person = {
                "name": _title_case(name),
                "role": role,
                "effective_date": effective_date,
                "address": address,
                "title": title,
            }
            if role == "Director":
                result["directors"].append(person)
            else:
                result["officers"].append(person)

    # Shareholders
    shareholder_section = re.search(r"ShareholderName\s+MailingAddress\s+ShareClass\s+SharesHeld\n(.*?)(?:Articles|$)", full_text, re.DOTALL)
    if shareholder_section:
        section = shareholder_section.group(1)
        # Each shareholder line: NAME ADDRESS CLASS SHARES
        lines = [l.strip() for l in section.split("\n") if l.strip()]
        i = 0
        while i < len(lines):
            line = lines[i]
            # Try to match: NAME ADDRESS CLASS SHARES
            m = re.match(r"([A-Z][A-Z\s]+?)\s{2,}(.+?)\s+(CLASS[A-Z])\s+(\d+)", line)
            if m:
                # Address may continue on next line
                address = m.group(2).strip()
                if i + 1 < len(lines) and not re.match(r"[A-Z][A-Z\s]+?\s{2,}", lines[i + 1]):
                    # continuation line for address
                    next_line = lines[i + 1].strip()
                    if not re.match(r"(Articles|Share|Event|Class)", next_line):
                        address += " " + next_line
                        i += 1
                result["shareholders"].append({
                    "name": _title_case(m.group(1).strip()),
                    "address": address,
                    "share_class": m.group(3),
                    "shares_held": int(m.group(4)),
                })
            i += 1

    # Share structure
    share_section = re.search(r"ClassName\s+VotingRights\s+AuthorizedNumber\s+NumberIssued\n(.*?)(?:EventHistory|$)", full_text, re.DOTALL)
    if share_section:
        for line in share_section.group(1).split("\n"):
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) >= 3 and parts[0].startswith("CLASS"):
                result["share_structure"].append({
                    "class_name": parts[0],
                    "voting_rights": parts[1] == "Yes",
                    "authorized": parts[2],
                    "issued": int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else None,
                })

    # Event history
    event_section = re.search(r"EventHistory\nType\s+Date\n(.*?)$", full_text, re.DOTALL)
    if event_section:
        for line in event_section.group(1).split("\n"):
            line = line.strip()
            if not line:
                continue
            # Last token is date (DD-Mon-YYYY)
            m = re.match(r"(.+?)\s+(\d{2}-[A-Z][a-z]{2}-\d{4})$", line)
            if m:
                result["event_history"].append({
                    "type": m.group(1).strip(),
                    "date": m.group(2),
                })

    # Remove raw_text from output (keep it for debugging if needed)
    del result["raw_text"]
    return result


def _title_case(name: str) -> str:
    """Convert ALL CAPS name to Title Case."""
    return " ".join(w.capitalize() for w in name.lower().split())


def main():
    if len(sys.argv) < 2:
        print("Usage: python corporate_registry.py <pdf_path> [output.json]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    result = parse_corporate_registry(pdf_path)

    if len(sys.argv) > 2:
        output_path = sys.argv[2]
        Path(output_path).write_text(json.dumps(result, indent=2))
        print(f"Written to {output_path}")
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
