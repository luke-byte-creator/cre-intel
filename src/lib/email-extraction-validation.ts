/**
 * Email AI Extraction Validation Utilities
 * 
 * Shared functions for validating AI-extracted data to prevent hallucination
 * in auto-insert email routes (@permit, @prospect, @industrial, @office)
 */

/**
 * Verify that a numeric value appears somewhere in the source text
 * This catches the most common hallucination pattern (AI inventing specific numbers)
 */
export function verifyNumericValueInSource(value: number | null | undefined, sourceText: string): boolean {
  if (value == null || isNaN(value)) return true; // Allow null values through
  
  const valueStr = value.toString();
  const normalizedSource = sourceText.toLowerCase().replace(/[,\s$]/g, '');
  
  // Check for exact match first
  if (normalizedSource.includes(valueStr)) return true;
  
  // Check for formatted variants (e.g., 18.50 might appear as $18.50, 18.5, etc.)
  const variants = [
    valueStr.replace('.00', ''), // 18.00 -> 18
    valueStr.replace(/\.?0+$/, ''), // 18.50 -> 18.5, 18.00 -> 18
    Math.round(value).toString(), // 18.50 -> 19 (rounding)
    Math.floor(value).toString(), // 18.50 -> 18 (floor)
  ];
  
  return variants.some(variant => normalizedSource.includes(variant));
}

/**
 * Validate extracted data JSON is well-formed
 */
export function validateExtractedDataJSON(data: any): { isValid: boolean; data?: any; error?: string } {
  if (!data) return { isValid: false, error: "No data provided" };
  
  try {
    // If it's already an object, try to serialize and parse it to check structure
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    const parsed = JSON.parse(jsonString);
    return { isValid: true, data: parsed };
  } catch (error) {
    return { isValid: false, error: `Invalid JSON: ${error}` };
  }
}

/**
 * Email format validation
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return true; // Allow null/undefined emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Basic phone format validation (allows various formats)
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return true; // Allow null/undefined phones
  // Remove all non-digits and check if we have 7-15 digits (flexible for international)
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Permit number validation - must be present and non-empty
 */
export function validatePermitNumber(permitNumber: string | null | undefined): boolean {
  return !!(permitNumber && permitNumber.trim().length > 0);
}

/**
 * Permit estimated value validation for Saskatoon market
 */
export function validatePermitValue(value: number | null | undefined): boolean {
  if (value == null) return true; // Allow null values
  return value >= 0 && value <= 100_000_000; // Not negative, not over $100M
}

/**
 * Industrial square footage validation
 */
export function validateIndustrialSF(sf: number | null | undefined): boolean {
  if (sf == null) return true; // Allow null values
  return sf > 0 && sf < 500_000; // Positive and reasonable for Saskatoon industrial
}

/**
 * Industrial asking rent validation for Saskatoon market
 */
export function validateIndustrialRent(rent: number | null | undefined): boolean {
  if (rent == null) return true; // Allow null values
  return rent > 1 && rent < 100; // Between $1 and $100 PSF for Saskatoon industrial
}

/**
 * Office square footage validation
 */
export function validateOfficeSF(sf: number | null | undefined): boolean {
  if (sf == null) return true; // Allow null values  
  return sf > 100 && sf < 100_000; // Between 100 and 100k SF
}

/**
 * Validate that required fields are present
 */
export function validateRequiredFields(data: any, requiredFields: string[]): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  for (const field of requiredFields) {
    const value = data[field];
    if (value == null || value === '' || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(field);
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Create anti-hallucination AI prompt instruction
 */
export const ANTI_HALLUCINATION_INSTRUCTION = `
IMPORTANT: ONLY extract values that are explicitly stated in the text. If a value is not clearly present, return null for that field. Do not infer, estimate, or generate values. It is better to return null than to guess.

When extracting numeric values (prices, square footage, etc.), ensure the number actually appears in the source text. Do not calculate, estimate, or derive values that aren't explicitly stated.
`.trim();

/**
 * Log validation failure to email-failures.json
 */
export async function logValidationFailure(
  tag: string, 
  emailRef: any, 
  reason: string, 
  extractedData?: any
): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const failureData = {
      timestamp: new Date().toISOString(),
      tag: tag,
      sourceRef: `${emailRef.from} - "${emailRef.subject}"`,
      errorReason: `Validation failed: ${reason}`,
      messageId: emailRef.messageId,
      extractedData: extractedData || null
    };

    const failuresPath = path.join(process.cwd(), "data", "email-failures.json");
    const dataDir = path.dirname(failuresPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let failures: any[] = [];
    if (fs.existsSync(failuresPath)) {
      try {
        const existingData = fs.readFileSync(failuresPath, 'utf-8');
        failures = JSON.parse(existingData);
      } catch (e) {
        console.error("Failed to read existing failures file:", e);
        failures = [];
      }
    }

    failures.push(failureData);
    
    // Keep only last 100 failures
    if (failures.length > 100) {
      failures = failures.slice(-100);
    }

    fs.writeFileSync(failuresPath, JSON.stringify(failures, null, 2));
    console.log(`Email validation failure logged: @${tag} - ${reason}`);
    
  } catch (error) {
    console.error("Failed to log validation failure:", error);
  }
}