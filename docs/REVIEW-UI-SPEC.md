# Review UI Specification

## Overview
After document extraction, the user sees an interactive review screen where they can:
1. Verify each extracted value
2. See confidence indicators and source references
3. Edit/override any value
4. Fill in missing fields
5. Resolve conflicts between sources
6. Generate the Excel model

## Page State Machine
The /underwrite page has 3 states:
1. **Upload** — Initial state. Upload documents, select asset class.
2. **Review** — After extraction. Review all inputs, edit, resolve conflicts.
3. **Complete** — After generation. Download the Excel file.

## Review Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Upload              Analysis: "123 Main St"       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ EXTRACTION SUMMARY                                       │ │
│  │ 📄 3 documents processed  │  ✅ 38 fields extracted     │ │
│  │ ⚠️ 4 need review          │  🔴 6 not found             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  [Property] [Income] [Expenses] [CapEx] [Financing] [Exit]  │
│                                                               │
│  PROPERTY INFORMATION                                         │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Property Name  [Hiland Office          ]  🟢 OM pg 1  │   │
│  │ Address        [123 Main St            ]  🟢 OM pg 1  │   │
│  │ City           [Saskatoon, SK          ]  🟢 OM pg 1  │   │
│  │ Property Type  [Office            ▾]     🟢 OM pg 1  │   │
│  │ NRA (SF)       [50,000                 ]  🟢 OM pg 3  │   │
│  │ Year Built     [1999                   ]  🟡 Verify    │   │
│  │ Floors         [                       ]  🔴 Not found │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ⚠️ CONFLICTS (2)                                             │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Base Rent: OM says $1,750,000 (Pro Forma)              │   │
│  │            T12 shows $1,675,000 (Actual)               │   │
│  │   Using: [$1,750,000 ▾]  Reasoning: Pro Forma...      │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  [Generate Excel Model ↓]                                     │
└─────────────────────────────────────────────────────────────┘
```

## Field Component Design

Each input field shows:
- Label (left)
- Input control (text, number, select, date)
- Confidence indicator (right):
  - 🟢 Green dot = high confidence, extracted from document
  - 🟡 Yellow dot = medium confidence, verify
  - 🔴 Red dot = not found, needs manual entry
  - ⚪ Gray dot = using default value
- Source reference (clickable — shows excerpt in tooltip/popover)

When user clicks a confidence dot:
- Popover shows: source document name, page number, extracted text excerpt, reasoning

When user edits a value:
- Confidence changes to "manual" 
- Dot turns blue to indicate user-edited

## Tab Sections

### Property Tab
- Property Name, Address, City, Province
- Property Type (dropdown: Office, Retail, Industrial, Mixed-Use)
- NRA (SF), Land Area (acres), Year Built, Floors, Parking

### Income Tab
- Base Rent (annual), Recovery Income, Parking Income, Other Income
- Vacancy Rate (%), Rent Abatement
- Historical: T-2, T-1, T12 revenue/expenses/NOI (if extracted)

### Expenses Tab
- Property Tax, Insurance, Utilities, R&M
- Management (% of EGI), Admin, Payroll, Marketing, Other
- Total shown as calculated sum

### CapEx Tab
- TI (PSF), Leasing Commissions (%), Capital Reserves (PSF)
- Upfront CapEx

### Financing Tab
- Purchase Price, Closing Cost %
- Loan Amount (or LTV %), Interest Rate, Amortization, Term, I/O Period
- Lender Fees %
- Note: "Financing terms are typically not in source documents. Enter manually."

### Exit Tab
- Exit Cap Rate, Selling Cost %
- Analysis Period (years), Discount Rate
- Growth Rates: Income, Expense, Property Tax, CapEx

## Rent Roll Section
Below the tabs, if rent roll data was extracted:
- Full tenant table (editable inline)
- Add/remove tenant rows
- Summary metrics (auto-calculated): Total SF, Occupancy, Wtd Avg Rent, WALT

## Generate Button
At the bottom:
- "Generate Excel Model" button
- Shows count of remaining red/yellow items
- Can generate even with red items (defaults will be used)
- Progress indicator while generating
- Once complete: Download button + "Save to Portfolio" option

## API Flow
1. Page loads analysis by ID
2. If status = "extracted", show Review screen with inputs from DB
3. User edits inputs → auto-saves via PATCH /api/underwrite/[id]
4. User clicks Generate → POST /api/underwrite/[id]/generate
5. Backend calls generateAcquisitionModel() with inputs
6. Saves .xlsx to disk, updates analysis with excelPath
7. Frontend shows download button
