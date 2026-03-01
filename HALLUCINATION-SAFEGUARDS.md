# Nova CRE Intel - Hallucination Reduction Safeguards

This document outlines the hallucination reduction safeguards implemented for AI extraction in auto-insert email routes.

## Implementation Summary

### 1. Shared Validation Utilities (`/src/lib/email-extraction-validation.ts`)

**Core Anti-Hallucination Functions:**
- `verifyNumericValueInSource()` - Verifies numeric values appear in source text
- `validateExtractedDataJSON()` - Validates JSON structure is well-formed
- `ANTI_HALLUCINATION_INSTRUCTION` - Standard prompt instruction for all extraction

**Validation Functions:**
- `validateRequiredFields()` - Ensures required fields are present
- `isValidEmail()` / `isValidPhone()` - Format validation
- `validatePermitNumber()` - Permit number presence validation
- `validatePermitValue()` - Saskatoon market value validation (0-$100M)
- `validateIndustrialSF()` - Industrial SF validation (0-500k SF)
- `validateIndustrialRent()` - Industrial rent validation ($1-100 PSF)
- `validateOfficeSF()` - Office SF validation (100-100k SF)

**Logging:**
- `logValidationFailure()` - Logs validation failures to email-failures.json

### 2. Updated AI Extraction Prompts

All auto-insert route extraction functions now include the anti-hallucination instruction:

> "ONLY extract values that are explicitly stated in the text. If a value is not clearly present, return null for that field. Do not infer, estimate, or generate values. It is better to return null than to guess."

**Functions Updated:**
- `extractPermitData()` 
- `extractProspectData()`
- `extractIndustrialData()`
- `extractOfficeData()`
- `extractCompDataPass1()` (non-auto-insert, but important)
- `extractLeaseTerms()` (non-auto-insert, but important)

### 3. Route-Specific Validation Rules

#### **@permit Route** (Auto-Insert)
**Required Validations:**
- ✅ Permit number must be present (dedup key requirement)
- ✅ Address must be present  
- ✅ Estimated value must be reasonable (≥$0, ≤$100M)
- ✅ Numeric verification: Estimated value must appear in source text

**Behavior:** Fails validation → logged to email-failures.json, no insert

#### **@prospect Route** (Auto-Insert) 
**Required Validations:**
- ✅ Name must be present
- ✅ At least one contact method (email, phone) OR company association
- ✅ Email format validation if provided
- ✅ Phone format validation if provided

**Behavior:** Fails validation → logged to email-failures.json, no insert

#### **@industrial Route** (Auto-Insert)
**Required Validations:**
- ✅ Address must be present
- ✅ Available SF must be positive and reasonable (<500k SF)
- ✅ Asking rent must be reasonable ($1-100 PSF) if present
- ✅ Minimum data: Address + SF required to justify insert
- ✅ Numeric verification: SF and rent must appear in source text

**Behavior:** Space-by-space validation, partial success allowed, validation failures counted and logged

#### **@office Route** (Auto-Insert)
**Required Validations:**
- ✅ Building must be found in officeBuildings table (already enforced)
- ✅ Floor must be present for each suite
- ✅ SF must be reasonable (100-100k) if present  
- ✅ Numeric verification: SF and rent must appear in source text

**Behavior:** Suite-by-suite validation, partial success allowed, validation failures counted and logged

### 4. JSON Structure Validation

All routes now validate JSON structure before processing:
- ✅ Well-formed JSON parsing with try/catch
- ✅ Rejects malformed data rather than crashing
- ✅ Logs malformed JSON to email-failures.json

### 5. Post-Extraction Sanity Checks

**Numeric Value Verification:**
- For all numeric fields (rent, SF, value), performs lightweight string search
- Checks if AI-returned numbers actually appear in source text
- Catches most common hallucination pattern (AI inventing specific numbers)
- Uses flexible matching for formatted variants ($18.50 vs 18.5)

### 6. Source Text Verification Pattern

Implemented the lightweight cross-reference pattern:
- Simple string search for numeric values in source text
- Flexible matching for different number formats
- Early rejection of likely hallucinated values
- No latency-heavy operations

## Validation Flow Example

```typescript
// 1. Extract data using AI (with anti-hallucination prompt)
const extractedData = await extractPermitData(text);

// 2. Validate JSON structure
const jsonValidation = validateExtractedDataJSON(extractedData);
if (!jsonValidation.isValid) → FAIL

// 3. Validate required fields
const requiredValidation = validateRequiredFields(data, ['permitNumber', 'address']);
if (!requiredValidation.isValid) → FAIL

// 4. Validate field-specific rules
if (!validatePermitValue(data.estimatedValue)) → FAIL

// 5. Verify numeric values in source text
if (!verifyNumericValueInSource(data.estimatedValue, sourceText)) → FAIL

// 6. If all validations pass → INSERT to database
// 7. If any validation fails → LOG to email-failures.json
```

## Constraints Maintained

✅ **No human approval steps** - Auto-insert routes remain auto-insert  
✅ **No latency-heavy operations** - No extra AI calls for verification  
✅ **Surgical changes** - Working code preserved, validation added  
✅ **Shared utility pattern** - `verifyNumericValueInSource()` used across all routes  
✅ **Clean compilation** - `npx next build` passes  

## Error Handling

- **Validation failures**: Logged to `data/email-failures.json` with detailed reasoning
- **Partial success**: Industrial and Office routes allow partial success (some spaces/suites valid)
- **Complete failure**: If all extracted items fail validation, entire extraction marked as failure
- **JSON malformation**: Caught and logged rather than crashing the UI

## Files Modified

1. `/src/lib/email-extraction-validation.ts` (NEW) - Shared validation utilities
2. `/src/app/api/email/inbound/route.ts` - Updated all auto-insert route handlers

## Testing Recommendation

Test each auto-insert route with:
1. **Valid data** - Should insert normally
2. **Hallucinated numbers** - Should reject and log to failures
3. **Missing required fields** - Should reject and log to failures  
4. **Malformed JSON** - Should handle gracefully and log to failures
5. **Invalid field formats** - Should validate and reject appropriately

The safeguards are now in place to significantly reduce hallucination risk while maintaining the auto-insert functionality and performance requirements.