# Nova Underwriter — Build Plan

## Build Order

### Phase 1: Foundation + Excel Template Engine
1. Install deps (exceljs, pdf-parse, mammoth)
2. DB schema for analyses
3. Page skeleton at /underwrite
4. Excel model template for Office/Retail/Industrial Acquisition

### Phase 2: Extraction + Review
5. Document upload API + file storage
6. AI extraction pipeline (PDF → structured JSON via Claude)
7. Review UI (assumptions screen with confidence indicators)

### Phase 3: Excel Generation + Wiring
8. Excel generation API (inputs → .xlsx download)
9. Wire upload → extract → review → generate flow
10. Sensitivity analysis in Excel output
11. Audit trail + reasoning sheet

### Phase 4: Additional Asset Classes
12. Multifamily Acquisition template
13. Industrial Development template
14. STNL Valuation template

### Phase 5: Polish
15. DD checklist tracker (basic)
16. Comp search integration (optional pull from DB)
17. Waterfall module (standalone)
18. Edge cases, error handling, testing

## Excel Model Structure (Office/Retail/Industrial Acquisition)

### Tab 1: Executive Summary
- Property details, key metrics, sources & uses, financing summary
- 1-page printable overview

### Tab 2: Assumptions  
- All input cells organized by category
- Sections: Property, Acquisition, Income, Expenses, Growth, CapEx, Financing, Exit

### Tab 3: Rent Roll
- Tenant-by-tenant: name, suite, SF, lease dates, rent, escalations, recovery type
- WALT, occupancy metrics, weighted avg rent

### Tab 4: Operating Statement / DCF
- T-2, T-1, T12, Pro Forma, Years 1-10
- Revenue → Vacancy → EGI → Expenses → NOI → CapEx → Cash Flow
- CAGR column, per SF column

### Tab 5: Debt Schedule
- Loan terms, annual debt service, balance over time
- DSCR and debt yield by year

### Tab 6: Returns Analysis
- Unlevered + Levered IRR, EMx, CoC
- Exit/terminal value calculation
- Year-by-year cash flows

### Tab 7: Sensitivity Analysis
- Exit Cap vs Discount Rate → IRR matrix
- Exit Cap vs Rent Growth → IRR matrix
- Occupancy vs Rent Growth → NOI matrix

### Tab 8: Market Context
- Manual entry tables for comparable sales and leases
- Reference note to Nova Research Transactions page

### Tab 9: Audit Trail
- Every input: value, source doc, page, confidence, reasoning
- Cross-validation checks

## Design Principles
- Blue font = input cells (editable assumptions)
- Black font = calculated cells (formulas)
- Clean dark header bands, Nova purple accent
- Print-ready layouts
- Named ranges for key assumptions
- Cell protection on formula cells
