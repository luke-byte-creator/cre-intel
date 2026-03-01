# Self-Critique: Nova Underwriter Proposal

## What the Proposal Gets Right
- Core workflow (upload → extract → review → Excel) is sound
- Audit trail concept is essential
- Asset class separation makes sense
- Phase 1/2 scoping is realistic

## What the Proposal Gets Wrong or Misses

### 1. The Rent Roll Problem
The proposal treats rent roll extraction as a simple table parse. In reality, commercial rent rolls are the single hardest document to extract reliably. Every landlord formats them differently. Recovery structures (NNN, modified gross, full service, base year stop) fundamentally change how you model income. Escalation clauses come in dozens of forms — CPI, fixed %, stepped, indexed.

**Fix:** The rent roll needs its own dedicated extraction + review flow. Each tenant gets its own row with full lease abstract. The user reviews EACH tenant's terms individually, not just aggregate numbers. This is where mistakes are most costly.

### 2. The "Reasoning" Audit Trail
Luke asked about reasoning — and he's right that just showing "source: page 14" isn't enough. A senior analyst doesn't just want to know WHERE a number came from. They want to know:
- WHY this number was chosen over a conflicting one
- WHETHER the number is reasonable compared to market
- WHAT assumptions were made to fill gaps

**Fix:** Add a "Reasonability Check" sheet that goes beyond source linking:
- For each rent: compare against our 490 lease comps by property type/city/size. Flag if >20% above or below market median.
- For each expense line: compare against typical ranges per SF for the asset class. Flag outliers.
- For cap rate: compare against our 2,099 sale comps. Show where this deal sits relative to market.
- For each conflicting value: explain the conflict and the resolution logic.

This turns the audit trail from "here's where I found it" to "here's why it makes sense (or doesn't)."

### 3. Missing: The Full DD Tracker
Luke's document list is a full due diligence package — 18 document categories. The underwriting model only uses maybe 5-6 of those directly. But the rest matter: service contracts affect expense projections, environmental reports affect risk, lease options affect rollover modeling.

**Fix:** The tool should have TWO modes:
1. **Quick Underwrite**: Upload an OM or a few key docs, get a model fast. This is the 80% use case.
2. **Full Due Diligence**: A DD checklist tracker where documents are uploaded, categorized, and key findings are extracted and flagged. The underwriting model pulls from this DD package. Service contracts feed into expense assumptions. Lease options feed into rollover modeling. Environmental flags feed into a risk summary.

Phase 1 = Quick Underwrite. Phase 2 = Full DD integration.

### 4. Missing: Sensitivity Analysis
No institutional analyst submits a model with a single scenario. At minimum you need:
- Base case / upside / downside
- Cap rate sensitivity table (exit cap vs. discount rate → IRR matrix)
- Rent growth sensitivity
- Occupancy sensitivity

**Fix:** The Excel output should include a sensitivity tab with pre-built data tables. This is straightforward in ExcelJS — just two-variable data tables with IRR as the output.

### 5. Missing: Market Comp Integration
We have 2,589 comps in the database. The underwriting tool should automatically pull relevant comps based on the property being analyzed:
- Sale comps: similar property type, city, size, date range → shows market pricing context
- Lease comps: similar property type, city → shows market rent context

This gets included as a "Market Context" tab in the Excel output. A senior analyst reviewing this model would see: "This deal is priced at $150/SF. The 5 most comparable recent sales averaged $142/SF. This is 5.6% above market."

**Fix:** Auto-pull comps from our database and include a Market Context sheet.

### 6. Excel Quality Concerns
ExcelJS can write formulas, but the proposal glosses over the complexity of building an institutional-quality model programmatically. Issues:
- Print area setup for professional presentation
- Conditional formatting for positive/negative values
- Number formatting consistency ($ vs %, decimal places)
- Cell protection (lock formula cells, unlock inputs)
- Named ranges that actually work cross-tab

**Fix:** Build ONE asset class model by hand in the web tool first, validate the Excel output thoroughly, THEN template the others. Don't try to build all four at once.

### 7. The "Original Design" Question
Luke doesn't want to copy Spencer Burton's formatting. But the model structure (income → expenses → NOI → CapEx → cash flow → returns) is universal — it's not Burton's invention. What needs to be original:
- Visual design (colors, fonts, layout)
- Tab organization
- How assumptions are presented
- The audit/reasoning layer (this doesn't exist in any model I've seen)

**Fix:** Design a clean Nova-branded model with our own color scheme, layout philosophy, and the unique audit/reasoning layer as a differentiator.

## Revised Architecture

```
UPLOAD DOCUMENTS
     ↓
AI EXTRACTION (per document type)
     ↓
RENT ROLL REVIEW (tenant by tenant)
     ↓
ASSUMPTIONS REVIEW (with market comp context)
     ↓
REASONABILITY CHECK (auto-flagging outliers vs our comp database)
     ↓
EXCEL GENERATION
  ├── Summary tab (1-page deal overview)
  ├── Rent Roll tab (tenant-by-tenant detail)
  ├── Operating Cash Flow (T12 → Pro Forma → 10yr DCF)
  ├── Returns tab (unlevered + levered IRR, EMx, CoC)
  ├── Sensitivity tab (cap rate × discount rate matrix)
  ├── Market Context tab (auto-pulled comps from our DB)
  ├── Audit Trail tab (source + reasoning for every input)
  └── Assumptions tab (all editable assumptions in one place)
```

## Revised Build Plan

### Day 1: Office/Retail/Industrial Acquisition
- This is the most common deal type and the most transferable model structure
- Covers the core extraction pipeline, review UI, and Excel generation
- Once this works well, the other asset classes are 70% done

### Day 2: Polish + Additional Asset Classes
- Multifamily (different because unit-mix-driven, not tenant-driven)
- Industrial Development (different because construction-period + lease-up)
- STNL (simpler — single tenant, focus on lease term analysis)

### Day 3: Full DD Tracker + Waterfall (separate module)
- DD checklist with document categorization
- Waterfall as standalone tool that accepts cash flows from any model

## Final Assessment

The original proposal was B+ work. Good concept, but it thought like a developer, not an analyst. The revised approach thinks about what makes a senior analyst trust a model:
1. Can I trace every number back to its source? (Audit trail)
2. Does this make sense relative to the market? (Comp integration)
3. What happens if my assumptions are wrong? (Sensitivity analysis)
4. Is the rent roll modeled correctly? (Tenant-by-tenant review)
5. What am I missing? (Reasonability checks + DD tracker)

Proceeding with the revised architecture. Starting with Office/Retail/Industrial Acquisition.
