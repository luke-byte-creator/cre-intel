"""
Entity Matching Engine
Matches companies, people, and properties across data sources using fuzzy matching.
Links corporate registry entities to transfer list parties and permit applicants.
"""

from typing import List
import re
import json
import sys
from difflib import SequenceMatcher
from pathlib import Path


# Common suffixes to normalize before matching
COMPANY_SUFFIXES = [
    r"\binc\.?\b", r"\bltd\.?\b", r"\bcorp\.?\b", r"\bcorporation\b",
    r"\bco\.?\b", r"\bllc\b", r"\bllp\b", r"\blp\b", r"\bpartnership\b",
    r"\bholdings?\b", r"\bgroup\b", r"\bproperties\b", r"\binvestments?\b",
    r"\brealty\b", r"\btrust\b", r"\bassociates?\b", r"\benterprise[s]?\b",
    r"\bdevelopment[s]?\b", r"\bconstruction\b",
]

# Address abbreviations for normalization
ADDRESS_ABBREVS = {
    "avenue": "ave", "street": "st", "drive": "dr", "road": "rd",
    "boulevard": "blvd", "crescent": "cres", "place": "pl",
    "court": "crt", "lane": "ln", "terrace": "terr",
    "parkway": "pkwy", "highway": "hwy", "circle": "cir",
    "north": "n", "south": "s", "east": "e", "west": "w",
}


def normalize_company_name(name: str) -> str:
    """Normalize company name for matching."""
    if not name:
        return ""
    name = name.lower().strip()
    # Remove punctuation
    name = re.sub(r"[.,;:'\"()\-]", " ", name)
    # Remove common suffixes
    for suffix in COMPANY_SUFFIXES:
        name = re.sub(suffix, "", name, flags=re.IGNORECASE)
    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()
    return name


def normalize_person_name(name: str) -> str:
    """Normalize person name for matching."""
    if not name:
        return ""
    name = name.lower().strip()
    name = re.sub(r"[.,;:'\"()\-]", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    # Sort name parts for order-independent matching (JOHN SMITH == SMITH JOHN)
    parts = sorted(name.split())
    return " ".join(parts)


def normalize_address(address: str) -> str:
    """Normalize address for matching."""
    if not address:
        return ""
    address = address.lower().strip()
    # Remove unit/suite info
    address = re.sub(r"#\d+|suite\s*\d+|unit\s*\d+", "", address)
    # Expand/normalize abbreviations
    for full, abbr in ADDRESS_ABBREVS.items():
        address = re.sub(rf"\b{full}\b", abbr, address)
        address = re.sub(rf"\b{abbr}\.\b", abbr, address)
    # Remove postal codes
    address = re.sub(r"[A-Z]\d[A-Z]\s*\d[A-Z]\d", "", address, flags=re.IGNORECASE)
    # Remove province/country
    address = re.sub(r",?\s*(?:saskatchewan|sk|canada)\b", "", address, flags=re.IGNORECASE)
    # Collapse
    address = re.sub(r"[,.]", " ", address)
    address = re.sub(r"\s+", " ", address).strip()
    return address


def similarity(a: str, b: str) -> float:
    """Calculate similarity ratio between two strings."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def match_company(name: str, candidates: List[dict], threshold: float = 0.80) -> List[dict]:
    """
    Find matching companies from candidates list.
    Each candidate should have at least a 'name' key.
    Returns matches with scores, sorted by score descending.
    """
    norm_name = normalize_company_name(name)
    if not norm_name:
        return []

    matches = []
    for candidate in candidates:
        norm_candidate = normalize_company_name(candidate.get("name", ""))
        if not norm_candidate:
            continue

        score = similarity(norm_name, norm_candidate)

        # Boost exact token overlap
        name_tokens = set(norm_name.split())
        cand_tokens = set(norm_candidate.split())
        if name_tokens and cand_tokens:
            overlap = len(name_tokens & cand_tokens) / max(len(name_tokens), len(cand_tokens))
            score = max(score, overlap)

        # Check for numbered company pattern (e.g., "102118427 Saskatchewan")
        num_match_a = re.match(r"^(\d{6,})", norm_name)
        num_match_b = re.match(r"^(\d{6,})", norm_candidate)
        if num_match_a and num_match_b and num_match_a.group(1) == num_match_b.group(1):
            score = 1.0

        if score >= threshold:
            matches.append({**candidate, "_match_score": round(score, 3)})

    matches.sort(key=lambda x: x["_match_score"], reverse=True)
    return matches


def match_person(name: str, candidates: List[dict], threshold: float = 0.85) -> List[dict]:
    """
    Find matching people from candidates list.
    Each candidate should have at least a 'name' key.
    """
    norm_name = normalize_person_name(name)
    if not norm_name:
        return []

    matches = []
    for candidate in candidates:
        norm_candidate = normalize_person_name(candidate.get("name", ""))
        if not norm_candidate:
            continue

        score = similarity(norm_name, norm_candidate)

        # Exact match on sorted parts
        if norm_name == norm_candidate:
            score = 1.0

        if score >= threshold:
            matches.append({**candidate, "_match_score": round(score, 3)})

    matches.sort(key=lambda x: x["_match_score"], reverse=True)
    return matches


def match_address(address: str, candidates: List[dict], threshold: float = 0.75) -> List[dict]:
    """
    Find matching properties/addresses from candidates list.
    Each candidate should have at least an 'address' key.
    """
    norm_addr = normalize_address(address)
    if not norm_addr:
        return []

    matches = []
    for candidate in candidates:
        norm_candidate = normalize_address(candidate.get("address", ""))
        if not norm_candidate:
            continue

        score = similarity(norm_addr, norm_candidate)

        # Check if street number and name match exactly
        num_a = re.match(r"(\d+)\s+(.+)", norm_addr)
        num_b = re.match(r"(\d+)\s+(.+)", norm_candidate)
        if num_a and num_b and num_a.group(1) == num_b.group(1):
            street_score = similarity(num_a.group(2), num_b.group(2))
            score = max(score, street_score * 0.95)

        if score >= threshold:
            matches.append({**candidate, "_match_score": round(score, 3)})

    matches.sort(key=lambda x: x["_match_score"], reverse=True)
    return matches


def cross_reference(
    registry_data: list[dict],
    transfers: list[dict],
    permits: list[dict],
    company_threshold: float = 0.80,
) -> dict:
    """
    Cross-reference entities across all three data sources.
    Returns a dict of linked entities with connections.
    """
    # Build entity lists
    registry_companies = []
    registry_people = []
    for reg in registry_data:
        registry_companies.append({
            "name": reg.get("entity_name", ""),
            "entity_number": reg.get("entity_number"),
            "source": "registry",
        })
        for d in reg.get("directors", []) + reg.get("officers", []) + reg.get("shareholders", []):
            registry_people.append({
                "name": d.get("name", ""),
                "role": d.get("role"),
                "company": reg.get("entity_name"),
                "source": "registry",
            })

    # Collect unique company names from transfers
    transfer_companies = set()
    for t in transfers:
        if t.get("vendor"):
            transfer_companies.add(t["vendor"])
        if t.get("purchaser"):
            transfer_companies.add(t["purchaser"])

    transfer_company_list = [{"name": n, "source": "transfer"} for n in transfer_companies]

    # Collect unique company names from permits
    permit_companies = set()
    for p in permits:
        if p.get("owner"):
            permit_companies.add(p["owner"])
    permit_company_list = [{"name": n, "source": "permit"} for n in permit_companies]

    # Cross-reference: registry companies -> transfers & permits
    links = []
    all_external = transfer_company_list + permit_company_list

    for reg_co in registry_companies:
        matches = match_company(reg_co["name"], all_external, company_threshold)
        for m in matches:
            links.append({
                "registry_entity": reg_co["name"],
                "entity_number": reg_co.get("entity_number"),
                "matched_name": m["name"],
                "matched_source": m["source"],
                "score": m["_match_score"],
            })

    # Cross-reference: transfer vendors/purchasers -> permits
    for tc in transfer_company_list:
        matches = match_company(tc["name"], permit_company_list, company_threshold)
        for m in matches:
            links.append({
                "transfer_entity": tc["name"],
                "matched_name": m["name"],
                "matched_source": "permit",
                "score": m["_match_score"],
            })

    return {
        "entity_links": links,
        "registry_companies": len(registry_companies),
        "transfer_companies": len(transfer_company_list),
        "permit_companies": len(permit_company_list),
        "total_links_found": len(links),
    }


def main():
    """Demo: load parsed data and cross-reference."""
    print("Entity Matching Engine")
    print("=" * 40)

    # Demo with sample data
    demo_companies = [
        {"name": "102118427 Saskatchewan Ltd."},
        {"name": "Boardwalk Reit Properties Holdings Ltd"},
        {"name": "Wright Construction Western Inc"},
    ]

    demo_transfers = [
        {"name": "Boardwalk Reit Properties Holdings Ltd", "source": "transfer"},
        {"name": "Boulevard Real Estate Equities Ltd", "source": "transfer"},
        {"name": "Wright Construction Western Inc", "source": "transfer"},
    ]

    print("\nCompany matching demo:")
    for co in demo_companies:
        matches = match_company(co["name"], demo_transfers)
        if matches:
            for m in matches:
                print(f"  {co['name']} -> {m['name']} (score: {m['_match_score']})")
        else:
            print(f"  {co['name']} -> no match")

    print("\nPerson matching demo:")
    people = [{"name": "Travis Batting"}, {"name": "Francois Messier"}]
    result = match_person("BATTING TRAVIS", people)
    for r in result:
        print(f"  BATTING TRAVIS -> {r['name']} (score: {r['_match_score']})")

    print("\nAddress matching demo:")
    addrs = [
        {"address": "125 5th Ave N, Saskatoon, SK"},
        {"address": "306 Ontario Avenue, Main Floor, Saskatoon, Saskatchewan"},
    ]
    result = match_address("306 ONTARIO AVENUE, MAINFLOOR, SASKATOON, Saskatchewan, Canada, S7K2H5", addrs)
    for r in result:
        print(f"  -> {r['address']} (score: {r['_match_score']})")


if __name__ == "__main__":
    main()
