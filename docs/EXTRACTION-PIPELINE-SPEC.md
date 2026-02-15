# Document Extraction Pipeline Specification

## Overview
Takes uploaded PDF/Excel documents and extracts structured data matching the AcquisitionInputs interface.

## Document Types & What to Extract

### Offering Memorandum (OM)
Primary source for most inputs:
- Property: name, address, city, type, SF, land area, year built, floors, parking
- Asking price, asking cap rate
- Historical financials (if included)
- Rent roll summary or detail
- Lease abstracts
- Tenant profiles
- Market overview (ignore for extraction — user handles market assumptions)

### Rent Roll
- Tenant names, suite numbers, SF per tenant
- Lease start/expiry dates
- Base rent (monthly or annual, PSF or total)
- Recovery type (NNN, MG, FS) and amount
- Escalation schedule
- Options (renewal, termination, expansion)
- Vacant suites

### Operating Statement / T12
- Revenue line items: base rent, recoveries, parking, other
- Expense line items: tax, insurance, utilities, R&M, mgmt, admin, etc.
- NOI
- CapEx
- If multiple years: T-2, T-1, T12

### Financial Statements
- Balance sheet items (less relevant for underwriting)
- Income statement (same as T12 essentially)
- Cash flow statement

### Tax Assessment
- Assessed value
- Current mill rate / tax amount
- Assessment date

### Appraisal
- Appraised value
- Cap rate used
- Comparable sales cited
- Land value

## Extraction Approach

### Step 1: Document Classification
First pass — classify each uploaded document:
```json
{
  "filename": "Property_Package.pdf",
  "docType": "offering_memorandum", // or "rent_roll", "operating_statement", "appraisal", "tax_assessment", "other"
  "pageCount": 45,
  "confidence": "high"
}
```

### Step 2: Targeted Extraction
Based on doc type, use a specific extraction prompt:

**For OM:**
"Extract the following from this offering memorandum. Return JSON. Use null for any field not found."

**For Rent Roll:**
"Extract each tenant row from this rent roll. Return a JSON array of tenant objects."

**For Operating Statement:**
"Extract all revenue and expense line items. Return JSON with separate sections for revenue, expenses, and NOI."

### Step 3: Conflict Resolution
When multiple documents provide the same field (e.g., rent roll total vs T12 base rent):
- Note both values
- Flag the discrepancy
- Use the most detailed source (rent roll over summary)
- Explain the choice in the reasoning field

## API Design

### POST /api/underwrite/[id]/extract
Request: { analysisId } (documents already uploaded)
Response: 
```json
{
  "status": "complete",
  "inputs": { /* AcquisitionInputs partial */ },
  "auditTrail": [
    {
      "field": "baseRent",
      "value": "1750000",
      "sourceDoc": "OM.pdf",
      "page": "14",
      "confidence": "high",
      "sourceText": "Gross Scheduled Rent: $1,750,000",
      "reasoning": "Found explicitly on operating statement page. Matches rent roll sum of $1,743,600 within 0.4%."
    }
  ],
  "warnings": [
    "Vacancy rate not stated in documents — using default 5%",
    "No financing terms found — user must enter manually"
  ],
  "conflicts": [
    {
      "field": "baseRent",
      "values": [
        { "value": 1750000, "source": "OM.pdf page 14", "label": "Pro Forma" },
        { "value": 1675000, "source": "OM.pdf page 14", "label": "T12 Actual" }
      ],
      "resolution": "Using Pro Forma ($1,750,000) as primary. T12 ($1,675,000) shown as historical."
    }
  ]
}
```

## Prompt Templates

### OM Extraction Prompt
```
You are a senior CRE financial analyst extracting data from an offering memorandum.

Extract ALL of the following fields. Return ONLY valid JSON.
For any field not found, use null.
For any field where you're uncertain, set confidence to "medium" or "low".
Include the page number and exact text excerpt for each extracted value.

{
  "property": {
    "name": { "value": "", "page": 0, "excerpt": "", "confidence": "high|medium|low" },
    "address": { ... },
    "city": { ... },
    "propertyType": { ... },
    "nraSF": { ... },
    "landArea": { ... },
    "yearBuilt": { ... },
    "floors": { ... },
    "parking": { ... }
  },
  "financial": {
    "askingPrice": { ... },
    "askingCapRate": { ... },
    "baseRent": { ... },
    "recoveryIncome": { ... },
    "parkingIncome": { ... },
    "otherIncome": { ... },
    "vacancyRate": { ... },
    "totalExpenses": { ... },
    "noi": { ... }
  },
  "expenses": {
    "propertyTax": { ... },
    "insurance": { ... },
    "utilities": { ... },
    "repairsMaint": { ... },
    "management": { ... },
    "admin": { ... },
    "payroll": { ... },
    "marketing": { ... },
    "other": { ... }
  },
  "historical": {
    "t2": { "year": 0, "revenue": 0, "expenses": 0, "noi": 0 },
    "t1": { "year": 0, "revenue": 0, "expenses": 0, "noi": 0 },
    "t12": { "year": 0, "revenue": 0, "expenses": 0, "noi": 0 }
  }
}
```

### Rent Roll Extraction Prompt
```
Extract the complete rent roll from this document. Return a JSON array of tenant objects.

For each tenant:
{
  "tenantName": "string",
  "suite": "string",
  "sf": number,
  "leaseStart": "YYYY-MM-DD or null",
  "leaseExpiry": "YYYY-MM-DD or null",
  "baseRentPSF": number (annual $/SF),
  "baseRentMonthly": number (if given as monthly),
  "baseRentAnnual": number (total annual),
  "recoveryType": "NNN|Modified Gross|Full Service|null",
  "recoveryPSF": number or null,
  "escalationType": "Fixed %|CPI|Stepped|null",
  "escalationRate": number or null,
  "options": "string description of any options",
  "notes": "any other relevant info",
  "isVacant": boolean,
  "confidence": "high|medium|low",
  "page": number
}

Also extract:
{
  "totalLeasedSF": number,
  "totalNRA": number,
  "occupancyRate": number
}
```

## Confidence Scoring Rules
- **High**: Value found explicitly, single clear source, matches expected format
- **Medium**: Value found but in ambiguous context, or slight formatting uncertainty, or minor conflict with another source
- **Low**: Value inferred from other data, or found in unclear context, or significant conflict
- **Default**: Value not found in any document, using system default
- **Manual**: User entered manually
