# Nova Underwriter — Financial Modeling Assistant
## Proposal v1

---

## The Problem

You have 30+ institutional-quality Excel models (Adventures in CRE, custom CBRE templates, waterfall models). Each one requires 30-90 minutes of manual data entry before you even start analyzing. The inputs are scattered across offering memorandums, rent rolls, operating statements, appraisals, and environmental reports — all PDFs. You spend more time *typing numbers in* than *thinking about the deal*.

Then after entry, you need to verify every cell reference because one wrong input cascades through the entire model. That's another 20-30 minutes of checking.

## The Vision

**Upload documents. Select asset class. Get a populated Excel model in under 60 seconds.**

The tool reads your source documents (OM, rent roll, T12, operating statements, appraisals), extracts every relevant number, maps them to the correct model inputs, generates a fully-wired Excel workbook, and gives you a clear audit trail showing exactly where each number came from.

You open the Excel file, scan the highlighted assumptions, adjust what you disagree with, and you're underwriting in minutes instead of hours.

---

## Architecture

### Asset Classes (Phase 1)

Based on your model library, these are the priority classes:

| Asset Class | Base Model | Key Inputs |
|---|---|---|
| **Office/Retail/Industrial Acquisition** | Simple Acquisition model (Spencer Burton v4.0) | T12/Pro Forma, rent roll, purchase price, financing terms, cap rate, growth assumptions |
| **Industrial Development** | Industrial Dev Model v2.2 | Land cost, hard/soft costs, construction timeline, lease-up assumptions, permanent debt |
| **Multifamily Acquisition** | Apartment Acquisition v3.1 | Unit mix/rent roll, T12, occupancy, CapEx per unit, renewal probabilities |
| **STNL Valuation** | STNL Valuation v2.4 | Lease terms, rent schedule, options, tenant credit, cap rate comps |

### Phase 2 (future)
- Hotel (Valuation/Acquisition/Development)
- Land Development
- Condo Development
- Self-Storage
- Equity Waterfall (plugs into any of the above)
- Hold vs. Sell Analysis
- Portfolio Valuation

---

## How It Works

### Step 1: Upload & Extract

User uploads 1-5 documents (PDF, Excel, or images). The AI reads them and extracts structured data:

**From an OM/Offering Memo:**
- Property name, address, year built, SF/units
- Asking price, asking cap rate
- Historical financials (T3, T12)
- Rent roll (unit types, rents, lease dates, SF)
- Operating expenses by line item
- Tenant profiles, lease abstracts

**From a Rent Roll:**
- Tenant names, suite/unit numbers
- Lease start/expiry, term remaining
- Base rent (PSF or monthly), escalations
- Recoveries (NNN, modified gross, full service)
- Options (renewal, expansion, termination)

**From Operating Statements / T12:**
- Revenue: base rent, recoveries, parking, other income
- Expenses: taxes, insurance, utilities, R&M, management, admin
- NOI, CapEx, cash flow
- Year-over-year trends

**From an Appraisal:**
- Land value, replacement cost
- Comparable sales/leases
- Environmental/zoning notes

### Step 2: Asset Class Selection & Model Mapping

User picks the asset class (or AI auto-detects from documents). The system maps extracted data to the specific model:

**Example — Office Acquisition:**
```
Extracted: "Base Rent: $1,750,000" → Model Cell G6 (Base Rent, Pro Forma Yr 1)
Extracted: "Recovery Income: $685,000" → Model Cell G7
Extracted: "Vacancy: 10%" → Model Cell D12
Extracted: "Purchase Price: $24.5M" → Model Cell D17
Extracted: "Interest Rate: 3.5%" → Model Cell H23
```

Each mapping includes:
- **Source**: "Page 14, Operating Statement, line 'Gross Scheduled Rent'"
- **Confidence**: High/Medium/Low
- **Notes**: "T12 shows $1,675,000; Pro Forma projects $1,750,000 — used Pro Forma"

### Step 3: Assumption Review (Web UI)

Before generating the Excel, the user sees a **review screen** with every extracted input organized by category:

```
PROPERTY INFO                          CONFIDENCE
├─ Property Name: Hiland Office        ██████████ High (OM pg 1)
├─ City: Saskatoon, SK                 ██████████ High (OM pg 1)
├─ NRA: 50,000 SF                      ██████████ High (OM pg 3)
└─ Year Built: 1999                    ██████░░░░ Medium (OM pg 7 — verify)

INCOME                                 
├─ Base Rent: $1,750,000               ██████████ High (T12 line 1)
├─ Recovery Income: $685,000           █████████░ High (T12 line 3)
├─ Vacancy: 10%                        ████░░░░░░ Low — DEFAULT ASSUMPTION
└─ Other Income: $100,000              ██████████ High (T12 line 5)

FINANCING                              
├─ Purchase Price: $24,508,462         ██████████ High (OM pg 1)
├─ Interest Rate: ___                  ░░░░░░░░░░ NOT FOUND — enter manually
└─ LTV: ___                            ░░░░░░░░░░ NOT FOUND — enter manually
```

**Color coding:**
- 🟢 Green = extracted from document, high confidence
- 🟡 Yellow = extracted but verify (multiple conflicting values, or inferred)
- 🔴 Red = not found, using default or needs manual entry
- ⚪ Gray = using model default (growth rates, etc.)

User can click any field to:
1. See the source excerpt (highlighted in original document)
2. Override the value
3. Accept as-is

### Step 4: Excel Generation

The system generates a `.xlsx` file using the template structure from your model library. This is NOT a screenshot or flat export — it's a **fully-wired Excel workbook** with:

- All formulas intact (IRR, NPV, XIRR, amortization, waterfall calculations)
- Input cells clearly marked (blue font, yellow fill — matching ACRED convention)
- Calculated cells locked with formulas
- Named ranges for key assumptions
- Tab structure matching your base models

**Audit Trail Tab** (new — this is the trust mechanism):

| Input Cell | Value | Source | Page | Confidence | Extracted Text |
|---|---|---|---|---|---|
| G6 Base Rent | $1,750,000 | OM.pdf | 14 | High | "Gross Scheduled Rent....$1,750,000" |
| D12 Vacancy | 10% | DEFAULT | — | — | Not found in documents; using model default |
| H23 Rate | 3.50% | Manual | — | — | User entered |

This tab is your cheat sheet. Instead of checking every cell manually, you scan this tab. Anything yellow or red gets your attention. Green means the AI found it and you can trace it back to the exact page and line in the source document.

### Step 5: Download & Edit

User downloads the Excel file, opens in Excel/Google Sheets, and works normally. Every formula works. They can override any assumption, run scenarios, add sensitivity tables — it's their model now.

---

## Trust & Verification Strategy

This is the most important part. You said you need to trust the numbers without manually checking every cell. Here's how:

### 1. Source Linking
Every extracted value links back to the source document, page number, and the exact text that was parsed. No black box.

### 2. Confidence Scoring
Three tiers:
- **High**: Value found explicitly in one clear location (e.g., "$24,500,000 Purchase Price" on page 1)
- **Medium**: Value inferred or found in multiple places with slight variance (e.g., different on T12 vs Pro Forma)
- **Low**: Calculated from other extracted values, or using a default assumption

### 3. Cross-Validation
Where possible, the AI cross-checks:
- Does revenue × (1 - vacancy) ≈ EGI? If not, flag it.
- Does NOI / price ≈ the stated cap rate? If not, flag it.
- Do individual expense line items sum to total expenses? If not, flag it.
- Does rent roll total match T12 base rent? If not, flag it.

Any discrepancy gets flagged in the review screen with both values shown.

### 4. Audit Trail Tab in Excel
As described above — this is the permanent record that lives in the workbook itself.

### 5. Assumption Defaults Documentation
All default assumptions (growth rates, cap rate spreads, reserve percentages) are documented and editable. The user can set their own defaults per asset class.

---

## Technical Implementation

### Stack
- **Frontend**: New tab in Nova Research (`/underwrite`)
- **Document Parsing**: Claude API (vision for scanned PDFs, text for digital PDFs)
- **Excel Generation**: ExcelJS (Node.js library — full formula support, styling, named ranges)
- **Template Storage**: Your base models converted to JSON schemas defining the cell map
- **Database**: SQLite (store completed analyses for portfolio tracking)

### AI Usage
- **Document extraction**: One Claude call per document (~$0.02-0.10 depending on length)
- **Cross-validation**: One call to verify extracted data internally (~$0.01)
- **Total per analysis**: ~$0.05-0.30

### Template System
Each asset class has a JSON "model map" that defines:
```json
{
  "assetClass": "office_acquisition",
  "baseModel": "Simple Acquisition v4.0",
  "tabs": ["Property Summary", "OS DCF", "Property Returns", "Partnership Returns"],
  "inputs": {
    "property_name": { "tab": "Property Summary", "cell": "D5", "type": "string" },
    "nra_sf": { "tab": "Property Summary", "cell": "H5", "type": "number" },
    "base_rent": { "tab": "OS DCF", "cell": "G6", "type": "currency" },
    "vacancy_rate": { "tab": "OS DCF", "cell": "D12", "type": "percent" },
    ...
  },
  "defaults": {
    "vacancy_rate": 0.05,
    "income_growth": 0.02,
    "expense_growth": 0.02,
    "capex_reserve_psf": 0.50
  }
}
```

Adding a new asset class = creating a new JSON map + template. No code changes.

---

## UX Flow (Single Page)

```
┌─────────────────────────────────────────────────────────┐
│  Nova Underwriter                                        │
│                                                          │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  1. UPLOAD        │  │  Asset Class: [Auto-detect ▾] │  │
│  │  ┌──────────────┐ │  │  ○ Office/Retail/Industrial  │  │
│  │  │  Drop files   │ │  │  ○ Industrial Development    │  │
│  │  │  here or      │ │  │  ○ Multifamily               │  │
│  │  │  click to     │ │  │  ○ STNL                      │  │
│  │  │  browse       │ │  └─────────────────────────────┘  │
│  │  └──────────────┘ │                                    │
│  │  OM.pdf ✓         │                                    │
│  │  T12.xlsx ✓       │                                    │
│  │  RentRoll.pdf ✓   │                                    │
│  └──────────────────┘                                    │
│                                                          │
│  [Extract & Review →]                                    │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  2. REVIEW ASSUMPTIONS                              │  │
│  │                                                     │  │
│  │  PROPERTY  │  INCOME  │  EXPENSES  │  FINANCING    │  │
│  │                                                     │  │
│  │  Base Rent         $1,750,000  🟢  OM pg 14        │  │
│  │  Recovery Income     $685,000  🟢  OM pg 14        │  │
│  │  Vacancy                  10%  🟡  Default — edit? │  │
│  │  Interest Rate          ____   🔴  Not found       │  │
│  │                                                     │  │
│  │  ⚠ 2 items need attention                          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  [Generate Excel Model ↓]                                │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  3. DOWNLOAD                                        │  │
│  │  📊 Hiland_Office_Acquisition_2026-02-15.xlsx       │  │
│  │  Model: Simple Acquisition (Office)                 │  │
│  │  Inputs: 42 extracted, 3 defaults, 2 manual         │  │
│  │  [Download] [Save to Portfolio] [New Analysis]      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Build Plan

### Sprint 1 (Day 1): Foundation
- Template schema system (JSON model maps)
- Document upload + PDF text extraction
- AI extraction pipeline (Claude structured output)
- ExcelJS template generation for Office/Retail/Industrial Acquisition

### Sprint 2 (Day 1-2): Review UI + Excel Output
- Review screen with confidence indicators
- Source highlighting (page + line reference)
- Cross-validation checks
- Audit trail tab generation
- Full Excel output with formulas, formatting, named ranges

### Sprint 3 (Day 2): Additional Asset Classes
- Industrial Development template
- Multifamily Acquisition template
- STNL Valuation template

### Sprint 4 (Day 2-3): Polish
- Portfolio storage (save analyses to DB)
- Default assumption management per asset class
- Re-run with different scenarios
- Edge case handling (scanned PDFs, partial data, unusual formats)

---

## Questions for You

1. **Which asset class do you use most?** I'll build that one first and nail it before expanding.

2. **What documents do you typically receive?** Is it usually an OM + rent roll? Or do you also get standalone T12s, appraisals, environmental reports?

3. **The Spencer Burton models use his formatting conventions (blue input cells, etc.). Do you want me to match his style exactly, or do you have a preferred format for the output Excel?**

4. **For the financing assumptions (interest rate, LTV, amortization) — these are rarely in the source docs. Do you want me to pull current market rates automatically, or just leave them blank for manual entry?**

5. **The waterfall / partnership returns — should that be included in the Phase 1 output, or is it something you layer on separately?**

6. **When you say "trust the numbers" — is the audit trail tab + confidence scoring sufficient, or do you want something more aggressive like a side-by-side comparison view (AI extraction vs. source document screenshot)?**
