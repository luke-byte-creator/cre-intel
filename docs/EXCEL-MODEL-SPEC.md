# Excel Model Specification: Office/Retail/Industrial Acquisition

## Design Philosophy
- Input cells: Blue font (#1A5276), light yellow fill (#FFF9E6)  
- Formula cells: Black font, no special fill
- Headers: Dark navy (#1B2A4A) with white text
- Section headers: Medium blue (#2C3E7A) with white text
- Subtotals: Light gray fill (#F0F0F0)
- Negative values: Red font
- Currency: #,##0 (no cents except PSF which is #,##0.00)
- Percentages: 0.00%
- Nova purple accent: #7C3AED for branding elements

## Tab 1: Executive Summary
Row layout (approximate):
- Row 1-2: "NOVA RESEARCH — INVESTMENT SUMMARY" header band
- Row 3: Property name (large)
- Row 5-15: Property Description (left) | Key Financial Metrics (right)
  - Left: Name, Address, City/Province, Property Type, NRA (SF), Land Area, Year Built, # Floors, Parking
  - Right: Purchase Price, Going-In Cap Rate, Exit Cap Rate, Unlevered IRR, Levered IRR, Equity Multiple, Avg Cash-on-Cash
- Row 17-28: Sources & Uses (left) | Financing Summary (right)
  - Sources: Equity, Debt (amount, %)
  - Uses: Purchase Price, Closing Costs, Upfront CapEx, Total
  - Financing: Loan Amount, LTV, Interest Rate, Amortization, Term, I/O Period, Annual Debt Service, DSCR
- Row 30-40: Investment Highlights (left) | Risk Factors (right)
  - Placeholder text cells for user to fill in

## Tab 2: Assumptions
All input cells grouped by section:
- PROPERTY: Name, Address, City, Type, NRA SF, Land Area, Year Built, Floors, Parking
- ACQUISITION: Purchase Price (or Price PSF + auto-calc), Closing Cost %, Upfront CapEx, Analysis Start Date, Analysis Period (years)
- INCOME: In-Place Rent PSF (or total), Recovery Income, Other Income, Vacancy Rate %, Rent Abatement
- EXPENSES (annual): Property Tax, Insurance, Utilities, R&M, Management (% of EGI or $/SF), Admin, Payroll, Marketing, Other
- GROWTH RATES: Income Growth %/yr, Expense Growth %/yr (excl tax), Property Tax Growth %/yr, CapEx Growth %/yr
- CAPITAL EXPENDITURES: TI PSF, Leasing Commissions %, Capital Reserves PSF, Upfront CapEx
- FINANCING: Loan Amount (or LTV %), Interest Rate, Amortization (years), Term (years), I/O Period (years), Lender Fees %
- EXIT: Exit Cap Rate, Selling Cost %, Exit Year (default = analysis period)
- DISCOUNT RATE: For DCF valuation

## Tab 3: Rent Roll
Table columns:
- Tenant Name | Suite/Unit | SF | % of NRA | Lease Start | Lease Expiry | Remaining Term (mo) | 
  Base Rent PSF | Annual Base Rent | Recovery Type | Recovery PSF | Escalation Type | Escalation Rate |
  Options (text) | Notes

Summary rows at bottom:
- Total SF Leased | Occupancy % | Weighted Avg Rent PSF | WALT (years) | Total Annual Base Rent
- Lease Expiry Profile: Year 1, 2, 3, 4, 5, 6-10 (SF expiring and % of total)

## Tab 4: Operating Statement / DCF
Columns: Label | T-2 Actual | T-1 Actual | T12 Actual | /SF | Pro Forma | /SF | Year 1 | Year 2 | ... | Year 10 | CAGR

Rows:
REVENUE
+ Base Rental Income (from rent roll)
+ Recoveries / Reimbursements  
+ Parking Income
+ Other Income
= Potential Gross Income

- Vacancy & Credit Loss (% × PGI)
- Rent Abatement
= Effective Gross Income (EGI)

OPERATING EXPENSES
- Property Tax
- Insurance
- Utilities  
- Repairs & Maintenance
- Management Fee (% of EGI)
- Administrative
- Payroll
- Marketing
- Other Expenses
= Total Operating Expenses

NET OPERATING INCOME (EGI - OpEx)

CAPITAL EXPENDITURES
- Tenant Improvements
- Leasing Commissions
- Capital Reserves
- Misc. CapEx
= Total Capital Expenditures

CASH FLOW FROM OPERATIONS (NOI - CapEx)

OPERATING METRICS (calculated per year):
- Rent PSF
- Expenses PSF  
- Expense Ratio (OpEx/EGI)
- NOI PSF
- CapEx as % of NOI

## Tab 5: Debt Schedule
- Loan amount, rate, I/O years, amortization
- Monthly/annual payment schedule
- Beginning balance, interest, principal, ending balance per year
- DSCR (NOI / Debt Service) per year
- Debt Yield (NOI / Loan Balance) per year

## Tab 6: Returns Analysis
REVERSION (SALE):
- Exit Year NOI (from DCF)
- Exit Cap Rate (from assumptions)
- Gross Sale Price = NOI / Exit Cap
- Less: Selling Costs
- Less: Loan Payoff (from debt schedule)
- Net Sale Proceeds

UNLEVERED RETURNS:
- Year 0: -(Purchase Price + Closing + CapEx)
- Years 1-N: Cash Flow from Operations (before debt service)
- Year N: + Net Sale Proceeds (before debt payoff, after selling costs)
- Unlevered IRR (XIRR)
- Unlevered Equity Multiple
- Avg Free & Clear Return

LEVERED RETURNS:
- Year 0: -(Total Equity Required)
- Years 1-N: Cash Flow after Debt Service
- Year N: + Equity Proceeds from Sale
- Levered IRR (XIRR)  
- Levered Equity Multiple
- Avg Cash-on-Cash Return

DCF VALUATION:
- Discount rate (from assumptions)
- Present value of cash flows
- Present value of reversion
- DCF Value
- DCF Value PSF

## Tab 7: Sensitivity Analysis
Three 2-variable data tables:

Table 1: Levered IRR
- Rows: Exit Cap Rate (±100bps in 25bp increments)
- Columns: Discount Rate (±200bps in 50bp increments)

Table 2: Levered IRR  
- Rows: Exit Cap Rate (±100bps in 25bp increments)
- Columns: Rent Growth Rate (0% to 4% in 0.5% increments)

Table 3: Year 1 NOI
- Rows: Occupancy (70% to 100% in 5% increments)
- Columns: Rent PSF (±20% in 5% increments from base)

## Tab 8: Market Context
Two empty formatted tables for user to fill in:

Comparable Sales:
- Address | City | Date | Price | Price/SF | Size SF | Property Type | Cap Rate | Comments

Comparable Leases:
- Address | City | Tenant | Rent/SF | Size SF | Start | Expiry | Type | Comments

Note at top: "Enter comparable transactions below. Use Nova Research → Transactions to search and copy comps."

## Tab 9: Audit Trail  
Table columns:
- Input Field | Tab | Cell | Extracted Value | Source Document | Page | Confidence | Source Text (excerpt) | Reasoning | Cross-Check Result

Cross-validation section at bottom:
- Rent Roll Total vs T12 Base Rent: Match? / Variance
- Sum of Expenses vs T12 Total Expenses: Match? / Variance
- Stated Cap Rate vs Calculated (NOI/Price): Match? / Variance
- Stated NOI vs Calculated (EGI - OpEx): Match? / Variance
