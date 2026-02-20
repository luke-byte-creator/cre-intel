import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as tnef from "node-tnef";
import { extractDocxXmlText } from "@/lib/docx-edit";
import { extractTextFromFile } from "@/lib/extract-text";
// @ts-ignore
import { simpleParser } from "mailparser";
import {
  verifyNumericValueInSource,
  validateExtractedDataJSON,
  isValidEmail,
  isValidPhone,
  validatePermitNumber,
  validatePermitValue,
  validateIndustrialSF,
  validateIndustrialRent,
  validateOfficeSF,
  validateRequiredFields,
  ANTI_HALLUCINATION_INSTRUCTION,
  logValidationFailure
} from "@/lib/email-extraction-validation";

// Load environment variables
const NOVA_EMAIL_SECRET = process.env.NOVA_EMAIL_SECRET;
const NOVA_EMAIL_WHITELIST = process.env.NOVA_EMAIL_WHITELIST?.split(',').map(email => email.trim()) || [];

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    data: string; // base64
  }>;
  receivedAt: string;
  authenticated?: boolean; // New field from worker
  authResults?: {
    spfPass: boolean;
    dkimPass: boolean;
    spfResult: string;
    dkimResult: string;
  };
}

function extractTagFromText(text: string): string | null {
  // Look for #tag pattern (case insensitive)
  const match = text.match(/#(\w+)/i);
  return match ? match[1].toLowerCase() : null;
}

function parseForwardedEmail(body: string): { instructions: string; context: string } {
  // Look for common forwarded email delimiters
  const forwardDelimiters = [
    /^\s*[-]{3,}\s*Forwarded\s+Message\s*[-]{3,}/mi,
    /^\s*[-]{3,}\s*Original\s+Message\s*[-]{3,}/mi,
    /^\s*From:/mi,
    /^\s*Sent:/mi,
    /^\s*Subject:/mi
  ];

  let splitIndex = -1;
  
  for (const delimiter of forwardDelimiters) {
    const match = body.match(delimiter);
    if (match && match.index !== undefined) {
      splitIndex = match.index;
      break;
    }
  }

  if (splitIndex === -1) {
    // No forwarded content detected
    return {
      instructions: body.trim(),
      context: ""
    };
  }

  return {
    instructions: body.substring(0, splitIndex).trim(),
    context: body.substring(splitIndex).trim()
  };
}

async function handleTnefAttachment(attachment: any): Promise<any[]> {
  try {
    // Decode base64 to buffer
    const buffer = Buffer.from(attachment.data, 'base64');
    
    // Parse TNEF
    const tnefData = tnef.parse(buffer);
    const extractedFiles: any[] = [];
    
    if (tnefData && tnefData.attachments) {
      for (const tnefAttachment of tnefData.attachments) {
        if (tnefAttachment.data) {
          extractedFiles.push({
            filename: tnefAttachment.name || 'extracted_file',
            contentType: 'application/octet-stream',
            size: tnefAttachment.data.length,
            data: tnefAttachment.data.toString('base64')
          });
        }
      }
    }
    
    return extractedFiles;
  } catch (error) {
    console.error("Failed to parse TNEF attachment:", error);
    return [];
  }
}

async function processAttachments(attachments: any[]): Promise<any[]> {
  const processedAttachments: any[] = [];
  
  for (const attachment of attachments) {
    // Handle winmail.dat / TNEF files
    if (attachment.filename?.toLowerCase() === 'winmail.dat' || 
        attachment.contentType === 'application/ms-tnef') {
      
      const extractedFiles = await handleTnefAttachment(attachment);
      processedAttachments.push(...extractedFiles);
    } else {
      processedAttachments.push(attachment);
    }
  }
  
  return processedAttachments;
}

function isWhitelisted(email: string): boolean {
  if (NOVA_EMAIL_WHITELIST.length === 0) {
    return false; // No whitelist configured = reject all
  }
  
  return NOVA_EMAIL_WHITELIST.some(whitelisted => 
    email.toLowerCase().includes(whitelisted.toLowerCase())
  );
}

async function routeToHandler(tag: string, emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (tag) {
      case 'drafter':
        return await handleDrafterRoute(emailData, attachments);
      
      case 'comp':
        return await handleCompRoute(emailData, attachments);
      
      case 'permit':
        return await handlePermitRoute(emailData, attachments);
      
      case 'prospect':
        return await handleProspectRoute(emailData, attachments);
      
      case 'industrial':
        return await handleIndustrialRoute(emailData, attachments);
      
      case 'office':
        return await handleOfficeRoute(emailData, attachments);
      
      case 'underwrite':
        return await handleUnderwriteRoute(emailData, attachments);
      
      default:
        // Save as unprocessed for manual review
        console.log(`Unknown tag: @${tag}, saving as unprocessed`);
        return {
          success: true,
          message: `Unknown tag @${tag}, saved for manual review`
        };
    }
  } catch (error) {
    console.error(`Error in route handler for @${tag}:`, error);
    return {
      success: false,
      message: `Failed to process @${tag}: ${error}`
    };
  }
}

async function handleDrafterRoute(emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    // Extract .docx attachment
    const docxAttachment = attachments.find(att => 
      att.filename?.toLowerCase().endsWith('.docx') ||
      att.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    if (!docxAttachment) {
      return {
        success: false,
        message: "No .docx attachment found for #drafter"
      };
    }

    // Save attachment to temp file for processing
    const tempDir = path.join(process.cwd(), "data", "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempFilename = `email_${Date.now()}_${docxAttachment.filename}`;
    const tempPath = path.join(tempDir, tempFilename);
    
    // Decode base64 and save file
    const fileBuffer = Buffer.from(docxAttachment.data, 'base64');
    fs.writeFileSync(tempPath, fileBuffer);

    // Call drafter AI classification
    const documentType = await classifyDocumentType(tempPath);
    
    // Get user from email (assume Luke for now - we could make this configurable)
    const user = await db.select().from(schema.users)
      .where(eq(schema.users.email, "luke.jansen@cbre.com"))
      .limit(1);
    
    if (!user[0]) {
      throw new Error("User not found");
    }

    // Generate draft using existing drafter logic
    const draftResult = await generateDraftFromEmail(
      tempPath,
      documentType,
      emailData.instructions,
      user[0].id,
      emailData.emailRef
    );

    // Cleanup temp file
    fs.unlinkSync(tempPath);

    return {
      success: true,
      message: `Document classified as ${documentType}, draft generated`,
      data: {
        documentType,
        draftId: draftResult.draftId,
        changeSummary: draftResult.changeSummary
      }
    };

  } catch (error) {
    console.error("#drafter route error:", error);
    return {
      success: false,
      message: `#drafter processing failed: ${error}`
    };
  }
}

async function handleCompRoute(emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    // Extract text from email body and/or attachments
    let extractedText = [emailData.instructions, emailData.context].filter(Boolean).join("\n\n");
    
    // Process attachments for additional text
    for (const attachment of attachments) {
      if (attachment.filename?.toLowerCase().endsWith('.pdf') || 
          attachment.filename?.toLowerCase().endsWith('.docx') ||
          attachment.contentType?.includes('pdf') ||
          attachment.contentType?.includes('word')) {
        
        const tempDir = path.join(process.cwd(), "data", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilename = `comp_${Date.now()}_${attachment.filename}`;
        const tempPath = path.join(tempDir, tempFilename);
        
        // Decode and save file
        const fileBuffer = Buffer.from(attachment.data, 'base64');
        fs.writeFileSync(tempPath, fileBuffer);

        try {
          if (attachment.filename?.toLowerCase().endsWith('.docx')) {
            const docText = await extractDocxXmlText(tempPath);
            extractedText += "\n\n" + docText;
          } else if (attachment.filename?.toLowerCase().endsWith('.pdf') || attachment.contentType?.includes('pdf')) {
            const pdfText = await extractTextFromFile(tempPath, 'application/pdf');
            if (pdfText && pdfText.trim().length > 0) {
              extractedText += "\n\n" + pdfText;
            }
          } else if (attachment.filename?.toLowerCase().endsWith('.pdf')) {
            // For PDF, we'd need a PDF parser - skip for now or use existing utility
            console.log("PDF attachment found but parsing not implemented yet");
          }
        } catch (e) {
          console.error("Failed to extract text from attachment:", e);
        } finally {
          fs.unlinkSync(tempPath);
        }
      }
    }

    if (!extractedText.trim()) {
      return {
        success: false,
        message: "No text content found in email or attachments"
      };
    }

    // Two-pass AI extraction
    console.log("Starting two-pass AI extraction for comp data...");
    
    // Pass 1: Extract only explicitly stated fields
    const pass1Data = await extractCompDataPass1(extractedText);
    
    // Pass 2: Infer reasonable values from context  
    const pass2Data = await extractCompDataPass2(extractedText, pass1Data);

    // Combine results with confidence tracking
    const compData = combineCompExtractionResults(pass1Data, pass2Data);

    // Duplicate detection
    const duplicateInfo = await detectDuplicate(compData);

    // Create source reference
    const sourceRef = `Email from ${emailData.emailRef.from} - "${emailData.emailRef.subject}" (${new Date(emailData.emailRef.receivedAt).toLocaleDateString()})`;

    // Save to pending_comps
    const now = new Date().toISOString();
    const result = await db.insert(schema.pendingComps).values({
      ...compData.fields,
      sourceType: "email",
      sourceRef,
      status: duplicateInfo.isDuplicate ? "duplicate" : "pending",
      duplicateOfId: duplicateInfo.duplicateOfId || null,
      confidence: compData.overallConfidence,
      fieldConfidence: JSON.stringify(compData.fieldConfidence),
      missingFields: JSON.stringify(compData.missingFields),
      notes: compData.notes + (duplicateInfo.isDuplicate ? `\n\nDUPLICATE DETECTED: ${duplicateInfo.reason}` : ""),
      createdAt: now,
      updatedAt: now,
    }).returning();

    return {
      success: true,
      message: `Comp extracted and saved${duplicateInfo.isDuplicate ? ' (duplicate detected)' : ''}`,
      data: {
        pendingCompId: result[0].id,
        confidence: compData.overallConfidence,
        missingFields: compData.missingFields,
        duplicateInfo
      }
    };

  } catch (error) {
    console.error("#comp route error:", error);
    return {
      success: false,
      message: `#comp processing failed: ${error}`
    };
  }
}

function getGatewayConfig() {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    port: config.gateway?.port || 18789,
    token: config.gateway?.auth?.token || "",
  };
}

async function callAI(messages: { role: string; content: string }[], maxTokens = 8000) {
  const { port, token } = getGatewayConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-20250514",
        messages,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`AI failed: ${res.status}`, errBody.slice(0, 500));
      throw new Error(`AI call failed: ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeout);
  }
}

async function classifyDocumentType(docxPath: string): Promise<string> {
  try {
    // Extract text from docx
    const docText = await extractDocxXmlText(docxPath);
    
    // AI classification
    const classification = await callAI([
      {
        role: "system",
        content: `You are a document classifier for commercial real estate documents. Given the text content of a document, classify it into one of these categories:

- otl: Offer to Lease
- loi: Letter of Intent  
- renewal: Lease Renewal
- lease_amendment: Lease Amendment
- sale_offer: Sale Offer
- rfp_response: RFP Response
- counter_offer: Counter-Offer
- lease_agreement: Lease Agreement

Return ONLY the category code (e.g., "otl", "loi", "renewal", etc.). If uncertain, return "loi" as default.`
      },
      {
        role: "user",
        content: `Classify this document:\n\n${docText.slice(0, 5000)}`
      }
    ], 500);

    const docType = classification.toLowerCase().trim();
    const validTypes = ['otl', 'loi', 'renewal', 'lease_amendment', 'sale_offer', 'rfp_response', 'counter_offer', 'lease_agreement'];
    
    if (validTypes.includes(docType)) {
      return docType;
    }
    
    // Default fallback
    return 'loi';
    
  } catch (error) {
    console.error("Document classification error:", error);
    return 'loi'; // Default fallback
  }
}

async function generateDraftFromEmail(docxPath: string, documentType: string, instructions: string, userId: number, emailRef: any) {
  try {
    // Extract document content
    const fullDocText = await extractDocxXmlText(docxPath);
    
    // Generate a change summary using AI
    const changeSummary = await callAI([
      {
        role: "system", 
        content: "You are helping summarize what will be changed in a document draft. Given the original document and user instructions, provide a brief summary of the key changes to be made."
      },
      {
        role: "user",
        content: `Document type: ${documentType}\n\nInstructions: ${instructions}\n\nDocument preview: ${fullDocText.slice(0, 2000)}\n\nProvide a concise summary of changes to be made.`
      }
    ], 1000);

    // Create source reference
    const sourceRef = `Email from ${emailRef.from} - "${emailRef.subject}" (${new Date(emailRef.receivedAt).toLocaleDateString()})`;

    // Save draft to database
    const now = new Date().toISOString();
    const docTypeLabels: Record<string, string> = {
      otl: "Offer to Lease",
      loi: "Letter of Intent",
      renewal: "Lease Renewal", 
      lease_amendment: "Lease Amendment",
      sale_offer: "Sale Offer",
      rfp_response: "RFP Response",
      counter_offer: "Counter-Offer",
      lease_agreement: "Lease Agreement",
    };

    const title = `${docTypeLabels[documentType] || documentType} — ${new Date().toLocaleDateString("en-CA")} (Email)`;

    const result = await db.insert(schema.documentDrafts).values({
      userId,
      dealId: null,
      documentType,
      title,
      referenceDocPath: docxPath,
      extractedStructure: fullDocText.slice(0, 50000),
      generatedContent: fullDocText, // Original content for now
      instructions: instructions || null,
      status: "ready_for_review", // Special status for email-generated drafts
      diffSummary: changeSummary,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return {
      draftId: result[0].id,
      changeSummary: changeSummary,
      title: title,
      sourceRef: sourceRef
    };

  } catch (error) {
    console.error("Draft generation error:", error);
    throw error;
  }
}

async function extractCompDataPass1(text: string): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `${ANTI_HALLUCINATION_INSTRUCTION}

You are extracting commercial real estate comparable data. In this FIRST PASS, only extract fields that are EXPLICITLY STATED in the text. Do not infer or guess any values.

Return a JSON object with only the fields you can find explicitly stated. Use null for any field not explicitly mentioned. Include a "confidence" field (0-1) for each extracted value.

Fields to look for:
- type: "Sale" or "Lease"
- address: full property address
- tenant: tenant name (for leases)
- landlord: landlord name (for leases) 
- seller: seller name (for sales)
- purchaser: buyer name (for sales)
- salePrice: sale price in dollars
- saleDate: date of sale/transaction
- leaseStart: lease start date
- leaseExpiry: lease expiry date
- netRentPSF: net rent per square foot
- areaSF: area in square feet
- termMonths: lease term in months
- propertyType: Office, Industrial, Retail, etc.

Example output:
{
  "type": {"value": "Lease", "confidence": 1.0},
  "address": {"value": "123 Main St, Saskatoon", "confidence": 0.9},
  "tenant": {"value": "ABC Corp", "confidence": 1.0},
  "netRentPSF": {"value": 18.50, "confidence": 0.8},
  "areaSF": null,
  "salePrice": null
}`
      },
      {
        role: "user",
        content: `Extract comp data from this text:\n\n${text}`
      }
    ], 4000);

    return JSON.parse(response);
  } catch (error) {
    console.error("Pass 1 extraction error:", error);
    return {};
  }
}

async function extractCompDataPass2(text: string, pass1Data: any): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system", 
        content: `You are doing a SECOND PASS extraction to infer missing commercial real estate data from context. You have the explicitly stated data from pass 1. Now try to reasonably infer missing values from context clues.

Pass 1 found these explicit values:
${JSON.stringify(pass1Data, null, 2)}

Now infer reasonable values for missing fields based on context. Mark inferred values with lower confidence (0.3-0.7). Only infer if you have reasonable basis.

Additional inference rules:
- If rent is mentioned without specifying net/gross, assume net
- If area not stated but rent amount given, try to infer from typical rates
- Property type from address/tenant type context
- Missing dates from context clues
- Calculate missing values (e.g., annual rent from PSF * SF)

Return the same JSON format with inferred values marked with appropriate confidence levels.`
      },
      {
        role: "user",
        content: `Infer missing values from this text:\n\n${text}`
      }
    ], 4000);

    return JSON.parse(response);
  } catch (error) {
    console.error("Pass 2 extraction error:", error);
    return {};
  }
}

function combineCompExtractionResults(pass1Data: any, pass2Data: any): any {
  const combined: any = {
    fields: {},
    fieldConfidence: {},
    missingFields: [],
    notes: "",
    overallConfidence: 0
  };

  // List of all possible comp fields
  const compFields = [
    'type', 'address', 'tenant', 'landlord', 'seller', 'purchaser',
    'salePrice', 'saleDate', 'leaseStart', 'leaseExpiry', 'netRentPSF',
    'areaSF', 'termMonths', 'propertyType', 'annualRent', 'pricePSF'
  ];

  let totalConfidence = 0;
  let fieldCount = 0;

  for (const field of compFields) {
    let value = null;
    let confidence = 0;
    let source = "";

    // Prefer pass 1 (explicit) over pass 2 (inferred)
    if (pass1Data[field]?.value !== null && pass1Data[field]?.value !== undefined) {
      value = pass1Data[field].value;
      confidence = pass1Data[field].confidence || 0.8;
      source = "explicit";
    } else if (pass2Data[field]?.value !== null && pass2Data[field]?.value !== undefined) {
      value = pass2Data[field].value;
      confidence = pass2Data[field].confidence || 0.5;
      source = "inferred";
    }

    if (value !== null) {
      combined.fields[field] = value;
      combined.fieldConfidence[field] = { confidence, source };
      totalConfidence += confidence;
      fieldCount++;
    } else {
      combined.missingFields.push(field);
    }
  }

  // Calculate overall confidence
  combined.overallConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;

  // Generate notes
  const explicitCount = Object.values(combined.fieldConfidence).filter((fc: any) => fc.source === "explicit").length;
  const inferredCount = Object.values(combined.fieldConfidence).filter((fc: any) => fc.source === "inferred").length;
  
  combined.notes = `Nova extracted ${explicitCount} explicit fields, inferred ${inferredCount} fields. ${combined.missingFields.length} fields could not be determined.`;

  return combined;
}

async function detectDuplicate(compData: any): Promise<{ isDuplicate: boolean; duplicateOfId?: number; reason?: string }> {
  try {
    if (!compData.fields.address) {
      return { isDuplicate: false };
    }

    // Normalize address for matching
    const normalizedAddress = normalizeAddress(compData.fields.address);

    // Search existing comps for potential duplicates
    const existingComps = await db.select()
      .from(schema.comps)
      .where(eq(schema.comps.addressNormalized, normalizedAddress))
      .limit(10);

    for (const existing of existingComps) {
      // Check for exact match on address + tenant/seller
      if (compData.fields.tenant && existing.tenant && 
          existing.tenant.toLowerCase().includes(compData.fields.tenant.toLowerCase())) {
        
        // Check date overlap for leases
        if (compData.fields.leaseStart && existing.leaseStart) {
          const newStart = new Date(compData.fields.leaseStart);
          const existingStart = new Date(existing.leaseStart);
          const timeDiff = Math.abs(newStart.getTime() - existingStart.getTime());
          const daysDiff = timeDiff / (1000 * 3600 * 24);
          
          if (daysDiff < 365) { // Within a year
            return {
              isDuplicate: true,
              duplicateOfId: existing.id,
              reason: `Similar lease for ${existing.tenant} at same address within ${Math.round(daysDiff)} days`
            };
          }
        }
      }

      // Check for renewal pattern
      if (compData.fields.tenant && existing.tenant &&
          existing.tenant.toLowerCase() === compData.fields.tenant.toLowerCase() &&
          existing.leaseExpiry && compData.fields.leaseStart) {
        
        const existingExpiry = new Date(existing.leaseExpiry);
        const newStart = new Date(compData.fields.leaseStart);
        const timeDiff = Math.abs(newStart.getTime() - existingExpiry.getTime());
        const daysDiff = timeDiff / (1000 * 3600 * 24);
        
        if (daysDiff < 60) { // New lease starts within 60 days of old expiry
          return {
            isDuplicate: false, // Not a duplicate, but flag as potential renewal
            reason: `Possible renewal of Comp #${existing.id} - ${existing.tenant} lease expired ${existing.leaseExpiry}`
          };
        }
      }
    }

    return { isDuplicate: false };

  } catch (error) {
    console.error("Duplicate detection error:", error);
    return { isDuplicate: false };
  }
}

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function handlePermitRoute(emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const sourceRef = `Email from ${emailData.emailRef.from} - "${emailData.emailRef.subject}" (${new Date(emailData.emailRef.receivedAt).toLocaleDateString()})`;
    const now = new Date().toISOString();

    // Try dedicated PDF parser first (handles City of Saskatoon weekly reports)
    let bulkInserted = 0;
    let bulkSkipped = 0;
    for (const attachment of attachments) {
      if (attachment.filename?.toLowerCase().endsWith('.pdf') || attachment.contentType?.includes('pdf')) {
        const fileBuffer = Buffer.from(attachment.data, 'base64');
        try {
          const { parseBuildingPermits } = await import("@/lib/parsers/building-permits");
          const permits = await parseBuildingPermits(fileBuffer, 350_000);
          console.log(`Building permit parser found ${permits.length} commercial permits in ${attachment.filename}`);

          if (permits.length > 0) {
            for (const permit of permits) {
              const existing = await db.select()
                .from(schema.permits)
                .where(eq(schema.permits.permitNumber, permit.permitNumber))
                .limit(1);

              if (existing[0]) {
                bulkSkipped++;
                continue;
              }

              await db.insert(schema.permits).values({
                permitNumber: permit.permitNumber,
                address: permit.address || null,
                addressNormalized: permit.address ? normalizeAddress(permit.address) : null,
                applicant: permit.owner || null,
                description: permit.scope || null,
                workType: permit.workType || null,
                buildingType: permit.buildingType || 'Commercial',
                estimatedValue: permit.value || null,
                issueDate: permit.issueDate || null,
                status: 'Active',
                rawSource: sourceRef,
                createdAt: now,
              });
              bulkInserted++;
            }

            return {
              success: true,
              message: `Parsed ${permits.length} permits from PDF: ${bulkInserted} inserted, ${bulkSkipped} duplicates skipped`,
              data: { parsed: permits.length, inserted: bulkInserted, skipped: bulkSkipped }
            };
          }
        } catch (e) {
          console.error("Building permit parser failed, falling back to AI extraction:", e);
        }
      }
    }

    // Fallback: AI extraction for non-standard permit formats
    let extractedText = [emailData.instructions, emailData.context].filter(Boolean).join("\n\n");

    for (const attachment of attachments) {
      if (attachment.filename?.toLowerCase().endsWith('.pdf') || 
          attachment.filename?.toLowerCase().endsWith('.docx') ||
          attachment.contentType?.includes('pdf') ||
          attachment.contentType?.includes('word')) {
        const tempDir = path.join(process.cwd(), "data", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFilename = `permit_${Date.now()}_${attachment.filename}`;
        const tempPath = path.join(tempDir, tempFilename);
        const fileBuffer = Buffer.from(attachment.data, 'base64');
        fs.writeFileSync(tempPath, fileBuffer);
        try {
          if (attachment.filename?.toLowerCase().endsWith('.docx')) {
            const docText = await extractDocxXmlText(tempPath);
            extractedText += "\n\n" + docText;
          } else {
            const pdfText = await extractTextFromFile(tempPath, 'application/pdf');
            if (pdfText && pdfText.trim().length > 0) {
              extractedText += "\n\n" + pdfText;
            }
          }
        } catch (e) {
          console.error("Failed to extract text from permit attachment:", e);
        } finally {
          fs.unlinkSync(tempPath);
        }
      }
    }

    if (!extractedText.trim()) {
      await logEmailFailure('permit', emailData.emailRef, 'No text content found in email or attachments');
      return { success: false, message: "No text content found - logged for review" };
    }

    const permitData = await extractPermitData(extractedText);
    const jsonValidation = validateExtractedDataJSON(permitData);
    if (!jsonValidation.isValid) {
      await logValidationFailure('permit', emailData.emailRef, `Malformed extraction data: ${jsonValidation.error}`, permitData);
      return { success: false, message: "Malformed permit data - logged for review" };
    }

    const validData = jsonValidation.data;
    if (!validatePermitNumber(validData.permitNumber)) {
      await logValidationFailure('permit', emailData.emailRef, 'Permit number is empty or invalid', validData);
      return { success: false, message: "Invalid permit number - logged for review" };
    }

    const existing = await db.select()
      .from(schema.permits)
      .where(eq(schema.permits.permitNumber, validData.permitNumber))
      .limit(1);

    if (existing[0]) {
      return { success: true, message: "Permit already exists - skipped duplicate" };
    }

    await db.insert(schema.permits).values({
      permitNumber: validData.permitNumber,
      address: validData.address,
      addressNormalized: normalizeAddress(validData.address),
      applicant: validData.applicant || null,
      description: validData.description || null,
      workType: validData.workType || null,
      buildingType: validData.buildingType || null,
      estimatedValue: validData.estimatedValue || null,
      issueDate: validData.issueDate || null,
      status: validData.status || 'Active',
      rawSource: sourceRef,
      createdAt: now,
    });

    return {
      success: true,
      message: "Permit data extracted and saved successfully",
      data: { permitNumber: validData.permitNumber, address: validData.address }
    };

  } catch (error) {
    console.error("#permit route error:", error);
    await logEmailFailure('permit', emailData.emailRef, `Processing error: ${error}`);
    return { success: false, message: "Permit processing failed - logged for review" };
  }

}

async function handleProspectRoute(emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    // Extract text from email body and/or attachments
    let extractedText = [emailData.instructions, emailData.context].filter(Boolean).join("\n\n");
    
    // Process attachments (same pattern as permit)
    for (const attachment of attachments) {
      if (attachment.filename?.toLowerCase().endsWith('.docx')) {
        const tempDir = path.join(process.cwd(), "data", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilename = `prospect_${Date.now()}_${attachment.filename}`;
        const tempPath = path.join(tempDir, tempFilename);
        
        const fileBuffer = Buffer.from(attachment.data, 'base64');
        fs.writeFileSync(tempPath, fileBuffer);

        try {
          const docText = await extractDocxXmlText(tempPath);
          extractedText += "\n\n" + docText;
        } catch (e) {
          console.error("Failed to extract text from prospect attachment:", e);
        } finally {
          fs.unlinkSync(tempPath);
        }
      }
    }

    if (!extractedText.trim()) {
      await logEmailFailure('prospect', emailData.emailRef, 'No text content found in email or attachments');
      return {
        success: false,
        message: "No text content found - logged for review"
      };
    }

    // Extract prospect data using AI
    const prospectData = await extractProspectData(extractedText);

    // Validate JSON structure
    const jsonValidation = validateExtractedDataJSON(prospectData);
    if (!jsonValidation.isValid) {
      await logValidationFailure('prospect', emailData.emailRef, `Malformed extraction data: ${jsonValidation.error}`, prospectData);
      return {
        success: false,
        message: "Malformed prospect data - logged for review"
      };
    }

    const validData = jsonValidation.data;

    // Validate required fields (name must be present)
    const requiredValidation = validateRequiredFields(validData, ['fullName']);
    if (!requiredValidation.isValid) {
      await logValidationFailure('prospect', emailData.emailRef, 'Missing required field: fullName', validData);
      return {
        success: false,
        message: "Missing person name - logged for review"
      };
    }

    // Validate at least one contact method OR company association
    const hasContactMethod = validData.email || validData.phone;
    const hasCompanyAssociation = validData.company;
    
    if (!hasContactMethod && !hasCompanyAssociation) {
      await logValidationFailure('prospect', emailData.emailRef, 'No contact method (email, phone) or company association found', validData);
      return {
        success: false,
        message: "No contact method or company found - logged for review"
      };
    }

    // Validate email format if provided
    if (validData.email && !isValidEmail(validData.email)) {
      await logValidationFailure('prospect', emailData.emailRef, `Invalid email format: ${validData.email}`, validData);
      return {
        success: false,
        message: "Invalid email format - logged for review"
      };
    }

    // Validate phone format if provided
    if (validData.phone && !isValidPhone(validData.phone)) {
      await logValidationFailure('prospect', emailData.emailRef, `Invalid phone format: ${validData.phone}`, validData);
      return {
        success: false,
        message: "Invalid phone format - logged for review"
      };
    }

    // Fuzzy dedup check
    const existingPerson = await findSimilarPerson(validData);
    
    const sourceRef = `Email from ${emailData.emailRef.from} - "${emailData.emailRef.subject}" (${new Date(emailData.emailRef.receivedAt).toLocaleDateString()})`;
    const now = new Date().toISOString();

    if (existingPerson) {
      // High confidence match - merge/update existing record
      const updates: any = { updatedAt: now };
      
      // Only fill gaps, don't overwrite existing data
      if (!existingPerson.email && validData.email) updates.email = validData.email;
      if (!existingPerson.phone && validData.phone) updates.phone = validData.phone;
      if (!existingPerson.address && validData.address) updates.address = validData.address;
      if (validData.notes) {
        updates.notes = existingPerson.notes ? 
          `${existingPerson.notes}\n\n[${new Date().toLocaleDateString()}] ${validData.notes}` :
          validData.notes;
      }
      
      // Update raw source to include new source
      if (existingPerson.rawSource && !existingPerson.rawSource.includes(sourceRef)) {
        updates.rawSource = `${existingPerson.rawSource}; ${sourceRef}`;
      } else if (!existingPerson.rawSource) {
        updates.rawSource = sourceRef;
      }

      if (Object.keys(updates).length > 1) { // More than just updatedAt
        await db.update(schema.people)
          .set(updates)
          .where(eq(schema.people.id, existingPerson.id));
        
        return {
          success: true,
          message: `Updated existing person record for ${validData.fullName}`,
          data: { personId: existingPerson.id, action: 'updated' }
        };
      } else {
        return {
          success: true,
          message: `Person ${validData.fullName} already exists with complete data`,
          data: { personId: existingPerson.id, action: 'skipped' }
        };
      }
    } else {
      // No match or low confidence - insert new record
      const result = await db.insert(schema.people).values({
        firstName: validData.firstName || extractFirstName(validData.fullName),
        lastName: validData.lastName || extractLastName(validData.fullName),
        fullName: validData.fullName,
        address: validData.address || null,
        email: validData.email || null,
        phone: validData.phone || null,
        notes: validData.notes || null,
        rawSource: sourceRef,
        createdAt: now,
        updatedAt: now,
      }).returning();

      return {
        success: true,
        message: `New person record created for ${validData.fullName}`,
        data: { personId: result[0].id, action: 'created' }
      };
    }

  } catch (error) {
    console.error("#prospect route error:", error);
    await logEmailFailure('prospect', emailData.emailRef, `Processing error: ${error}`);
    return {
      success: false,
      message: "Prospect processing failed - logged for review"
    };
  }
}

async function extractPermitData(text: string): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `${ANTI_HALLUCINATION_INSTRUCTION}

Extract building permit information from the provided text. Return a JSON object with these fields:

Required fields:
- permitNumber: string (permit/application number)
- address: string (property address)

Optional fields:
- applicant: string (applicant name)
- estimatedValue: number (estimated value in dollars, parse from text like "$50,000" or "50K")
- description: string (work description)
- workType: string (e.g., "New Building", "Renovation", "Demolition", "Addition")
- buildingType: string (e.g., "Commercial", "Residential", "Industrial")
- issueDate: string (YYYY-MM-DD format)
- status: string (e.g., "Issued", "Pending", "Complete")

If any required field is missing, return null. Be conservative with parsing - only extract what is explicitly stated.

Example output:
{
  "permitNumber": "BP2024-001",
  "address": "123 Main St, Saskatoon, SK",
  "applicant": "ABC Construction",
  "estimatedValue": 250000,
  "description": "New commercial warehouse",
  "workType": "New Building",
  "buildingType": "Commercial",
  "issueDate": "2024-01-15",
  "status": "Issued"
}`
      },
      {
        role: "user",
        content: `Extract permit data from this text:\n\n${text}`
      }
    ], 2000);

    const parsed = JSON.parse(response);
    return parsed;
  } catch (error) {
    console.error("Permit data extraction error:", error);
    return null;
  }
}

async function extractProspectData(text: string): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `${ANTI_HALLUCINATION_INSTRUCTION}

Extract person/company contact information from the provided text. Return a JSON object with these fields:

Required fields:
- fullName: string (person's full name)

Optional fields:
- firstName: string 
- lastName: string
- company: string (company/organization name)
- role: string (job title/role)
- phone: string (phone number, normalize format)
- email: string (email address)
- address: string (physical address)
- notes: string (any additional relevant information)

Only extract information that is explicitly stated. Do not make assumptions or generate contact details.

Example output:
{
  "fullName": "John Smith",
  "firstName": "John", 
  "lastName": "Smith",
  "company": "Colliers International",
  "role": "Senior Leasing Representative",
  "phone": "306-555-0123",
  "email": "john.smith@colliers.com",
  "address": "201-220 3rd Ave S, Saskatoon, SK",
  "notes": "Specializes in industrial properties"
}`
      },
      {
        role: "user",
        content: `Extract prospect data from this text:\n\n${text}`
      }
    ], 2000);

    return JSON.parse(response);
  } catch (error) {
    console.error("Prospect data extraction error:", error);
    return null;
  }
}

async function findSimilarPerson(prospectData: any): Promise<any> {
  try {
    // Get all people to do fuzzy matching (in a real system, you'd want to optimize this)
    const allPeople = await db.select().from(schema.people).limit(1000);
    
    const targetName = prospectData.fullName.toLowerCase();
    const targetCompany = prospectData.company?.toLowerCase() || '';

    for (const person of allPeople) {
      const personName = person.fullName.toLowerCase();
      const personNotes = person.notes?.toLowerCase() || '';
      
      // Check for high confidence name match
      const nameMatch = calculateNameSimilarity(targetName, personName);
      
      if (nameMatch > 0.85) { // High confidence name match
        // Check for company match in notes or compare companies
        if (targetCompany && (
          personNotes.includes(targetCompany) ||
          personNotes.includes(targetCompany.split(' ')[0]) // First word of company
        )) {
          return person; // High confidence match
        } else if (!targetCompany || targetCompany === '') {
          return person; // Name match with no company info to conflict
        }
      }
    }
    
    return null; // No high confidence match found
  } catch (error) {
    console.error("Similar person lookup error:", error);
    return null;
  }
}

function calculateNameSimilarity(name1: string, name2: string): number {
  // Simple similarity calculation - in production you might want a more sophisticated algorithm
  const words1 = name1.split(' ').filter(w => w.length > 1);
  const words2 = name2.split(' ').filter(w => w.length > 1);
  
  let matches = 0;
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2) {
        matches++;
        break;
      }
      // Check for partial matches (e.g., "John" vs "Johnny")
      if (word1.length > 3 && word2.length > 3 && 
          (word1.includes(word2) || word2.includes(word1))) {
        matches += 0.8;
        break;
      }
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
}

function extractFirstName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  return parts[0] || '';
}

function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

async function handleIndustrialRoute(emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    // Extract text from email body and/or attachments
    let extractedText = [emailData.instructions, emailData.context].filter(Boolean).join("\n\n");
    
    // Process attachments for additional text
    for (const attachment of attachments) {
      if (attachment.filename?.toLowerCase().endsWith('.pdf') || 
          attachment.filename?.toLowerCase().endsWith('.docx') ||
          attachment.contentType?.includes('pdf') ||
          attachment.contentType?.includes('word')) {
        
        const tempDir = path.join(process.cwd(), "data", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilename = `industrial_${Date.now()}_${attachment.filename}`;
        const tempPath = path.join(tempDir, tempFilename);
        
        // Decode and save file
        const fileBuffer = Buffer.from(attachment.data, 'base64');
        fs.writeFileSync(tempPath, fileBuffer);

        try {
          if (attachment.filename?.toLowerCase().endsWith('.docx')) {
            const docText = await extractDocxXmlText(tempPath);
            extractedText += "\n\n" + docText;
          } else if (attachment.filename?.toLowerCase().endsWith('.pdf') || attachment.contentType?.includes('pdf')) {
            const pdfText = await extractTextFromFile(tempPath, 'application/pdf');
            if (pdfText && pdfText.trim().length > 0) {
              extractedText += "\n\n" + pdfText;
            }
          }
          // For PDF, we'd need a PDF parser - skip for now or use existing utility
        } catch (e) {
          console.error("Failed to extract text from industrial attachment:", e);
        } finally {
          fs.unlinkSync(tempPath);
        }
      }
    }

    if (!extractedText.trim()) {
      await logEmailFailure('industrial', emailData.emailRef, 'No text content found in email or attachments');
      return {
        success: false,
        message: "No text content found - logged for review"
      };
    }

    // Extract industrial availability data using AI
    const industrialData = await extractIndustrialData(extractedText);

    // Validate JSON structure and basic data
    if (!industrialData || !Array.isArray(industrialData) || industrialData.length === 0) {
      await logValidationFailure('industrial', emailData.emailRef, 'No industrial availability data extracted from content', industrialData);
      return {
        success: false,
        message: "No industrial data extracted - logged for review"
      };
    }

    const sourceRef = `Email from ${emailData.emailRef.from} - "${emailData.emailRef.subject}" (${new Date(emailData.emailRef.receivedAt).toLocaleDateString()})`;
    const now = new Date().toISOString();
    let insertCount = 0;
    let updateCount = 0;
    let validationFailures = 0;

    // Process each space/bay separately
    for (const space of industrialData) {
      // Validate JSON structure for this space
      const jsonValidation = validateExtractedDataJSON(space);
      if (!jsonValidation.isValid) {
        console.error(`Industrial space validation failed: ${jsonValidation.error}`);
        validationFailures++;
        continue;
      }

      const validSpace = jsonValidation.data;

      // Validate required fields (address must be present)
      const requiredValidation = validateRequiredFields(validSpace, ['address']);
      if (!requiredValidation.isValid) {
        console.error('Industrial space missing required field: address');
        validationFailures++;
        continue;
      }

      // Validate available SF is positive and reasonable
      if (!validateIndustrialSF(validSpace.availableSF)) {
        console.error(`Industrial space invalid SF: ${validSpace.availableSF} (must be positive and < 500,000)`);
        validationFailures++;
        continue;
      }

      // Validate asking rent if present
      if (!validateIndustrialRent(validSpace.askingRent)) {
        console.error(`Industrial space invalid rent: ${validSpace.askingRent} (must be $1-100 PSF)`);
        validationFailures++;
        continue;
      }

      // Verify numeric values appear in source text
      const numericFields = ['availableSF', 'askingRent', 'totalBuildingSF', 'clearHeight', 'loadingDoors'];
      let hasNumericHallucination = false;
      
      for (const field of numericFields) {
        if (validSpace[field] && !verifyNumericValueInSource(validSpace[field], extractedText)) {
          console.error(`Industrial space ${field} value ${validSpace[field]} not found in source text - possible hallucination`);
          hasNumericHallucination = true;
          break;
        }
      }
      
      if (hasNumericHallucination) {
        validationFailures++;
        continue;
      }

      // Validate minimum data requirement (address + SF to justify insert)
      if (!validSpace.availableSF) {
        console.error('Industrial space missing available SF - insufficient data to justify insert');
        validationFailures++;
        continue;
      }

      const normalizedAddress = normalizeAddress(validSpace.address);
      
      // Check for existing vacancy at this address + bay/unit
      const existing = await db.select()
        .from(schema.industrialVacancies)
        .where(eq(schema.industrialVacancies.addressNormalized, normalizedAddress))
        .limit(10); // Get recent entries for this address

      // Try to match by bay/unit identifier if provided
      let matchedExisting = null;
      if (validSpace.bayUnit && existing.length > 0) {
        matchedExisting = existing.find(e => 
          e.notes?.toLowerCase().includes(validSpace.bayUnit.toLowerCase()) ||
          e.notes?.toLowerCase().includes(`bay ${validSpace.bayUnit}`) ||
          e.notes?.toLowerCase().includes(`unit ${validSpace.bayUnit}`)
        );
      }

      if (matchedExisting) {
        // Update existing record
        await db.update(schema.industrialVacancies)
          .set({
            availableSF: validSpace.availableSF || matchedExisting.availableSF,
            listingBrokerage: validSpace.listingBrokerage || matchedExisting.listingBrokerage,
            notes: validSpace.notes ? 
              (matchedExisting.notes ? `${matchedExisting.notes}\n\n[${new Date().toLocaleDateString()}] ${validSpace.notes}` : validSpace.notes) :
              matchedExisting.notes,
            updatedAt: now,
          })
          .where(eq(schema.industrialVacancies.id, matchedExisting.id));
        
        updateCount++;
      } else {
        // Insert new record
        const currentQuarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
        const currentYear = new Date().getFullYear();

        await db.insert(schema.industrialVacancies).values({
          address: validSpace.address,
          addressNormalized: normalizedAddress,
          availableSF: validSpace.availableSF || null,
          totalBuildingSF: validSpace.totalBuildingSF || null,
          listingBrokerage: validSpace.listingBrokerage || null,
          listingType: 'email',
          quarterRecorded: currentQuarter,
          yearRecorded: currentYear,
          notes: validSpace.notes ? `${validSpace.notes}\n\nSource: ${sourceRef}` : `Source: ${sourceRef}`,
          createdAt: now,
          updatedAt: now,
        });

        insertCount++;
      }
    }

    // Log if we had validation failures
    if (validationFailures > 0) {
      console.warn(`Industrial processing had ${validationFailures} validation failures out of ${industrialData.length} spaces`);
    }

    // If all spaces failed validation, log as failure
    if (validationFailures === industrialData.length) {
      await logValidationFailure('industrial', emailData.emailRef, `All ${industrialData.length} spaces failed validation`, industrialData);
      return {
        success: false,
        message: "All industrial spaces failed validation - logged for review"
      };
    }

    return {
      success: true,
      message: `Industrial data processed: ${insertCount} new entries, ${updateCount} updates${validationFailures > 0 ? ` (${validationFailures} validation failures)` : ''}`,
      data: {
        insertCount,
        updateCount,
        validationFailures,
        totalSpaces: industrialData.length
      }
    };

  } catch (error) {
    console.error("#industrial route error:", error);
    await logEmailFailure('industrial', emailData.emailRef, `Processing error: ${error}`);
    return {
      success: false,
      message: "Industrial processing failed - logged for review"
    };
  }
}

async function handleOfficeRoute(emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    // Extract text from email body and/or attachments
    let extractedText = [emailData.instructions, emailData.context].filter(Boolean).join("\n\n");
    
    // Process attachments for additional text
    for (const attachment of attachments) {
      if (attachment.filename?.toLowerCase().endsWith('.pdf') || 
          attachment.filename?.toLowerCase().endsWith('.docx') ||
          attachment.contentType?.includes('pdf') ||
          attachment.contentType?.includes('word')) {
        
        const tempDir = path.join(process.cwd(), "data", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilename = `office_${Date.now()}_${attachment.filename}`;
        const tempPath = path.join(tempDir, tempFilename);
        
        // Decode and save file
        const fileBuffer = Buffer.from(attachment.data, 'base64');
        fs.writeFileSync(tempPath, fileBuffer);

        try {
          if (attachment.filename?.toLowerCase().endsWith('.docx')) {
            const docText = await extractDocxXmlText(tempPath);
            extractedText += "\n\n" + docText;
          } else if (attachment.filename?.toLowerCase().endsWith('.pdf') || attachment.contentType?.includes('pdf')) {
            const pdfText = await extractTextFromFile(tempPath, 'application/pdf');
            if (pdfText && pdfText.trim().length > 0) {
              extractedText += "\n\n" + pdfText;
            }
          }
        } catch (e) {
          console.error("Failed to extract text from office attachment:", e);
        } finally {
          fs.unlinkSync(tempPath);
        }
      }
    }

    if (!extractedText.trim()) {
      await logEmailFailure('office', emailData.emailRef, 'No text content found in email or attachments');
      return {
        success: false,
        message: "No text content found - logged for review"
      };
    }

    // Extract office vacancy data using AI
    const officeData = await extractOfficeData(extractedText);

    // Validate JSON structure
    const jsonValidation = validateExtractedDataJSON(officeData);
    if (!jsonValidation.isValid) {
      await logValidationFailure('office', emailData.emailRef, `Malformed extraction data: ${jsonValidation.error}`, officeData);
      return {
        success: false,
        message: "Malformed office data - logged for review"
      };
    }

    const validData = jsonValidation.data;

    // Validate required structure
    if (!validData || !validData.buildingAddress || !validData.suites || !Array.isArray(validData.suites) || validData.suites.length === 0) {
      await logValidationFailure('office', emailData.emailRef, 'No office vacancy data extracted - missing building address or suites', validData);
      return {
        success: false,
        message: "No office data extracted - logged for review"
      };
    }

    // Find the building in officeBuildings table
    const normalizedBuildingAddress = normalizeAddress(validData.buildingAddress);
    const building = await db.select()
      .from(schema.officeBuildings)
      .where(eq(schema.officeBuildings.addressNormalized, normalizedBuildingAddress))
      .limit(1);

    if (!building[0]) {
      await logValidationFailure('office', emailData.emailRef, `Building not found in database: ${validData.buildingAddress}`, validData);
      return {
        success: false,
        message: "Building not found in database - logged for review"
      };
    }

    const buildingId = building[0].id;
    const sourceRef = `Email from ${emailData.emailRef.from} - "${emailData.emailRef.subject}"`;
    const now = new Date().toISOString();
    let updateCount = 0;
    let insertCount = 0;
    let validationFailures = 0;
    const processedSuites: string[] = [];

    // Process each suite from the brochure
    for (const suiteData of validData.suites) {
      // Validate JSON structure for this suite
      const suiteJsonValidation = validateExtractedDataJSON(suiteData);
      if (!suiteJsonValidation.isValid) {
        console.error(`Office suite validation failed: ${suiteJsonValidation.error}`);
        validationFailures++;
        continue;
      }

      const validSuite = suiteJsonValidation.data;

      // Validate required fields (floor must be present)
      const requiredValidation = validateRequiredFields(validSuite, ['floor']);
      if (!requiredValidation.isValid) {
        console.error('Office suite missing required field: floor');
        validationFailures++;
        continue;
      }

      // Validate SF is reasonable if present
      if (validSuite.availableSF && !validateOfficeSF(validSuite.availableSF)) {
        console.error(`Office suite invalid SF: ${validSuite.availableSF} (must be 100-100,000 SF)`);
        validationFailures++;
        continue;
      }

      // Verify numeric values appear in source text
      const numericFields = ['availableSF', 'askingRent'];
      let hasNumericHallucination = false;
      
      for (const field of numericFields) {
        if (validSuite[field] && !verifyNumericValueInSource(validSuite[field], extractedText)) {
          console.error(`Office suite ${field} value ${validSuite[field]} not found in source text - possible hallucination`);
          hasNumericHallucination = true;
          break;
        }
      }
      
      if (hasNumericHallucination) {
        validationFailures++;
        continue;
      }

      // Get existing units for this building and floor
      const existingUnits = await db.select()
        .from(schema.officeUnits)
        .where(and(
          eq(schema.officeUnits.buildingId, buildingId),
          eq(schema.officeUnits.floor, validSuite.floor)
        ))
        .all();

      let matchedUnit = null;
      let matchType = '';

      // Priority 1: Exact suite match
      if (validSuite.suite) {
        matchedUnit = existingUnits.find(u => 
          u.suite?.toLowerCase() === validSuite.suite.toLowerCase()
        );
        if (matchedUnit) matchType = 'exact_suite';
      }

      // Priority 2: Floor + SF match (within 10%)
      if (!matchedUnit && validSuite.availableSF) {
        matchedUnit = existingUnits.find(u => {
          if (!u.areaSF) return false;
          const sizeDiff = Math.abs(u.areaSF - validSuite.availableSF) / u.areaSF;
          return sizeDiff <= 0.1; // Within 10%
        });
        if (matchedUnit) matchType = 'sf_match';
      }

      if (matchedUnit) {
        // Update existing unit
        const updates: any = {
          isVacant: 1,
          listingAgent: validSuite.listingAgent || matchedUnit.listingAgent,
          askingRent: validSuite.askingRent || matchedUnit.askingRent,
          rentBasis: validSuite.rentBasis || matchedUnit.rentBasis,
          listingBrokerage: validSuite.listingBrokerage || matchedUnit.listingBrokerage,
          availableDate: validSuite.availableDate || matchedUnit.availableDate,
          source: 'email',
          sourceRef: sourceRef,
          lastSeen: now,
          updatedAt: now,
        };

        // Add notes about alternate suite naming if applicable
        if (matchType === 'sf_match' && validSuite.suite && matchedUnit.suite !== validSuite.suite) {
          const alternateNote = `Alternate suite name: ${validSuite.suite}`;
          updates.notes = matchedUnit.notes ? 
            `${matchedUnit.notes}\n${alternateNote}` : alternateNote;
        }

        await db.update(schema.officeUnits)
          .set(updates)
          .where(eq(schema.officeUnits.id, matchedUnit.id));

        updateCount++;
        processedSuites.push(`${validSuite.floor}${validSuite.suite ? `-${validSuite.suite}` : ''} (updated)`);

      } else {
        // No match - insert new unit
        let insertNotes = `Source: ${sourceRef}`;
        
        // Check if other units exist on this floor (possible reconfiguration)
        if (existingUnits.length > 0 && validSuite.availableSF) {
          insertNotes += `\nFloor ${validSuite.floor} total SF may need review — possible suite reconfiguration`;
        }
        
        await db.insert(schema.officeUnits).values({
          buildingId: buildingId,
          floor: validSuite.floor,
          suite: validSuite.suite || null,
          areaSF: validSuite.availableSF || null,
          isVacant: 1,
          listingAgent: validSuite.listingAgent || null,
          askingRent: validSuite.askingRent || null,
          rentBasis: validSuite.rentBasis || null,
          listingBrokerage: validSuite.listingBrokerage || null,
          availableDate: validSuite.availableDate || null,
          source: 'email',
          sourceRef: sourceRef,
          lastSeen: now,
          status: 'active',
          notes: insertNotes,
          updatedAt: now,
        });

        insertCount++;
        processedSuites.push(`${validSuite.floor}${validSuite.suite ? `-${validSuite.suite}` : ''} (new)`);
      }
    }

    // Log if we had validation failures
    if (validationFailures > 0) {
      console.warn(`Office processing had ${validationFailures} validation failures out of ${validData.suites.length} suites`);
    }

    // If all suites failed validation, log as failure
    if (validationFailures === validData.suites.length) {
      await logValidationFailure('office', emailData.emailRef, `All ${validData.suites.length} suites failed validation`, validData);
      return {
        success: false,
        message: "All office suites failed validation - logged for review"
      };
    }

    return {
      success: true,
      message: `Office vacancies processed for ${building[0].address}: ${insertCount} new units, ${updateCount} updates${validationFailures > 0 ? ` (${validationFailures} validation failures)` : ''}`,
      data: {
        buildingAddress: validData.buildingAddress,
        insertCount,
        updateCount,
        validationFailures,
        processedSuites
      }
    };

  } catch (error) {
    console.error("#office route error:", error);
    await logEmailFailure('office', emailData.emailRef, `Processing error: ${error}`);
    return {
      success: false,
      message: "Office processing failed - logged for review"
    };
  }
}

async function extractIndustrialData(text: string): Promise<any[]> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `${ANTI_HALLUCINATION_INSTRUCTION}

Extract industrial availability data from broker brochures. Return a JSON array where each item represents an available bay/space.

Each item should have these fields:
- address: string (property address)
- availableSF: number (available square feet)
- totalBuildingSF: number (total building size, if mentioned)
- bayUnit: string (bay/unit identifier like "Bay 1", "Unit A")
- askingRent: number (asking rent if mentioned)
- rentBasis: string ("net" | "gross" | "unconfirmed")
- availableDate: string (YYYY-MM-DD if mentioned)
- clearHeight: number (clear height in feet)
- loadingDoors: number (number of loading doors)
- powerInfo: string (power information if mentioned)
- officePercent: number (office percentage if mentioned)
- listingBrokerage: string (listing brokerage name)
- listingBroker: string (broker name)
- landlord: string (landlord name)
- notes: string (any additional specs or details)

A single brochure may have multiple available spaces - extract each as a separate array item.
Only extract values explicitly stated. For numeric fields (availableSF, askingRent), verify the numbers actually appear in the source text.

Example output:
[
  {
    "address": "123 Industrial Way, Saskatoon",
    "availableSF": 15000,
    "totalBuildingSF": 45000,
    "bayUnit": "Bay A",
    "askingRent": 12.50,
    "rentBasis": "net",
    "clearHeight": 24,
    "loadingDoors": 2,
    "listingBrokerage": "Colliers International",
    "listingBroker": "John Smith",
    "notes": "Excellent truck access, recently renovated"
  }
]`
      },
      {
        role: "user",
        content: `Extract industrial availability data from this content:\n\n${text}`
      }
    ], 4000);

    const parsed = JSON.parse(response);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Industrial data extraction error:", error);
    return [];
  }
}

async function extractOfficeData(text: string): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `${ANTI_HALLUCINATION_INSTRUCTION}

Extract office vacancy data from broker brochures. Return a JSON object with this structure:

{
  "buildingAddress": string (building address),
  "suites": [
    {
      "floor": string (floor number/identifier),
      "suite": string (suite number/name),
      "availableSF": number (available square feet),
      "askingRent": number (asking rent per SF),
      "rentBasis": string ("net" | "gross" | "unconfirmed"),
      "listingAgent": string (listing agent name),
      "listingBrokerage": string (listing brokerage),
      "availableDate": string (YYYY-MM-DD if mentioned)
    }
  ]
}

A single brochure may list multiple available suites - include each in the suites array.
Only extract values that are explicitly stated. For numeric fields (availableSF, askingRent), ensure the numbers appear in the source text.

Example output:
{
  "buildingAddress": "201 3rd Ave S, Saskatoon",
  "suites": [
    {
      "floor": "5",
      "suite": "501",
      "availableSF": 2500,
      "askingRent": 18.50,
      "rentBasis": "net",
      "listingAgent": "Jane Doe",
      "listingBrokerage": "CBRE",
      "availableDate": "2024-03-01"
    }
  ]
}`
      },
      {
        role: "user",
        content: `Extract office vacancy data from this content:\n\n${text}`
      }
    ], 4000);

    return JSON.parse(response);
  } catch (error) {
    console.error("Office data extraction error:", error);
    return null;
  }
}

async function handleUnderwriteRoute(emailData: any, attachments: any[]): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    // 1. Extract property address from email
    let propertyAddress = null;
    
    // Look for address after #underwrite tag in subject and body
    const fullText = `${emailData.subject} ${[emailData.instructions, emailData.context].filter(Boolean).join("\n\n") || emailData.body}`;
    const underwriteMatch = fullText.match(/#underwrite\s+([^#\n]+)/i);
    if (underwriteMatch) {
      propertyAddress = underwriteMatch[1].trim();
    }

    // If no address in email, try to extract from first attachment
    if (!propertyAddress && attachments.length > 0) {
      const firstAttachment = attachments.find(att => 
        att.filename?.toLowerCase().endsWith('.docx') || 
        att.filename?.toLowerCase().endsWith('.pdf')
      );
      
      if (firstAttachment) {
        const tempDir = path.join(process.cwd(), "data", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilename = `underwrite_${Date.now()}_${firstAttachment.filename}`;
        const tempPath = path.join(tempDir, tempFilename);
        
        const fileBuffer = Buffer.from(firstAttachment.data, 'base64');
        fs.writeFileSync(tempPath, fileBuffer);

        try {
          let docText = "";
          if (firstAttachment.filename?.toLowerCase().endsWith('.docx')) {
            docText = await extractDocxXmlText(tempPath);
          }
          
          // Simple AI extraction to find property address
          const addressExtraction = await callAI([
            {
              role: "system",
              content: "Extract the property address from this lease document. Return only the address, nothing else. If no clear address is found, return 'NOT FOUND'."
            },
            {
              role: "user",
              content: `Extract property address from this document:\n\n${docText.slice(0, 2000)}`
            }
          ], 500);
          
          if (addressExtraction && addressExtraction !== 'NOT FOUND') {
            propertyAddress = addressExtraction.trim();
          }
        } catch (e) {
          console.error("Failed to extract address from first attachment:", e);
        } finally {
          fs.unlinkSync(tempPath);
        }
      }
    }

    if (!propertyAddress) {
      await logEmailFailure('underwrite', emailData.emailRef, 'No property address found in email or attachments');
      return {
        success: false,
        message: "No property address found - please include address after #underwrite tag"
      };
    }

    // 2. Normalize address and find/create package
    const normalizedAddress = normalizeAddress(propertyAddress);
    
    // Get user (assume Luke for now - we could make this configurable)
    const user = await db.select().from(schema.users)
      .where(eq(schema.users.email, "luke.jansen@cbre.com"))
      .limit(1);
    
    if (!user[0]) {
      throw new Error("User not found");
    }

    // Look for existing package with "collecting" status
    let existingPackage = await db.select()
      .from(schema.underwritingPackages)
      .where(and(
        eq(schema.underwritingPackages.propertyAddressNormalized, normalizedAddress),
        eq(schema.underwritingPackages.createdBy, user[0].id),
        eq(schema.underwritingPackages.status, "collecting")
      ))
      .limit(1);

    let packageId: number;
    const now = new Date().toISOString();

    if (existingPackage[0]) {
      packageId = existingPackage[0].id;
      // Update the package timestamp
      await db.update(schema.underwritingPackages)
        .set({ updatedAt: now })
        .where(eq(schema.underwritingPackages.id, packageId));
    } else {
      // Create new package
      const newPackage = await db.insert(schema.underwritingPackages).values({
        propertyAddress,
        propertyAddressNormalized: normalizedAddress,
        propertyId: null, // Could try to match to properties table later
        status: "collecting",
        createdBy: user[0].id,
        createdAt: now,
        updatedAt: now,
      }).returning();
      packageId = newPackage[0].id;
    }

    // 3. Process attachments
    const sourceRef = `Email from ${emailData.emailRef.from} - "${emailData.emailRef.subject}" (${new Date(emailData.emailRef.receivedAt).toLocaleDateString()})`;
    const processedDocuments: any[] = [];
    let successCount = 0;
    let partialCount = 0;
    let failCount = 0;

    for (const attachment of attachments) {
      // Skip non-lease documents
      if (!attachment.filename?.toLowerCase().match(/\.(docx|pdf)$/)) {
        continue;
      }

      // Save file to data/underwriting/
      const underwritingDir = path.join(process.cwd(), "data", "underwriting");
      if (!fs.existsSync(underwritingDir)) fs.mkdirSync(underwritingDir, { recursive: true });

      const savedFilename = `${packageId}_${Date.now()}_${attachment.filename}`;
      const savedPath = path.join(underwritingDir, savedFilename);
      
      const fileBuffer = Buffer.from(attachment.data, 'base64');
      fs.writeFileSync(savedPath, fileBuffer);

      // Extract text content
      let docText = "";
      try {
        if (attachment.filename?.toLowerCase().endsWith('.docx')) {
          docText = await extractDocxXmlText(savedPath);
        }
        // PDF extraction would go here - for now skip PDFs
      } catch (e) {
        console.error(`Failed to extract text from ${attachment.filename}:`, e);
      }

      // AI extraction for lease terms
      let extractedData: any = {};
      let fieldConfidence: any = {};
      let extractionStatus = "failed";
      let documentNotes = "";

      if (docText.trim()) {
        try {
          const leaseExtraction = await extractLeaseTerms(docText);
          if (leaseExtraction) {
            extractedData = leaseExtraction.extractedData || {};
            fieldConfidence = leaseExtraction.fieldConfidence || {};
            
            // Determine extraction status
            const coreFields = ['tenantName', 'areaSF', 'baseRentPSF'];
            const hasCore = coreFields.some(field => extractedData[field] && extractedData[field] !== null);
            
            if (hasCore && Object.keys(extractedData).length >= 5) {
              extractionStatus = "success";
              successCount++;
            } else if (hasCore || Object.keys(extractedData).length >= 2) {
              extractionStatus = "partial";
              partialCount++;
            } else {
              extractionStatus = "failed";
              failCount++;
            }
          } else {
            failCount++;
            documentNotes = "AI extraction returned no data";
          }
        } catch (e) {
          console.error(`Lease extraction failed for ${attachment.filename}:`, e);
          extractionStatus = "failed";
          failCount++;
          documentNotes = `Extraction error: ${e}`;
        }
      } else {
        extractionStatus = "failed";
        failCount++;
        documentNotes = "Could not extract text from document";
      }

      // Check for duplicates within package
      const existingDocs = await db.select()
        .from(schema.underwritingDocuments)
        .where(eq(schema.underwritingDocuments.packageId, packageId));

      let isDuplicate = false;
      if (extractedData.tenantName && extractedData.suite) {
        isDuplicate = existingDocs.some(doc => {
          if (!doc.extractedData) return false;
          try {
            const docData = JSON.parse(doc.extractedData);
            return docData.tenantName?.toLowerCase() === extractedData.tenantName?.toLowerCase() &&
                   docData.suite?.toLowerCase() === extractedData.suite?.toLowerCase();
          } catch {
            return false;
          }
        });
      }

      if (isDuplicate) {
        documentNotes += "\nDuplicate detected - same tenant and suite already exists in package";
      }

      // Check for address mismatch
      if (extractedData.propertyAddress) {
        const docNormalizedAddress = normalizeAddress(extractedData.propertyAddress);
        if (docNormalizedAddress !== normalizedAddress) {
          documentNotes += `\nAddress mismatch - document appears to reference ${extractedData.propertyAddress}`;
        }
      }

      // Save document record
      await db.insert(schema.underwritingDocuments).values({
        packageId,
        fileName: attachment.filename,
        filePath: savedPath,
        extractedData: JSON.stringify(extractedData),
        fieldConfidence: JSON.stringify(fieldConfidence),
        extractionStatus,
        source: "email",
        sourceRef,
        notes: documentNotes.trim() || null,
        createdAt: now,
        updatedAt: now,
      });

      processedDocuments.push({
        fileName: attachment.filename,
        extractionStatus,
        tenantName: extractedData.tenantName || null,
        areaSF: extractedData.areaSF || null,
        baseRentPSF: extractedData.baseRentPSF || null,
      });
    }

    if (processedDocuments.length === 0) {
      await logEmailFailure('underwrite', emailData.emailRef, 'No valid lease documents found in attachments');
      return {
        success: false,
        message: "No valid lease documents (.docx, .pdf) found in attachments"
      };
    }

    return {
      success: true,
      message: `Processed ${processedDocuments.length} documents for ${propertyAddress}: ${successCount} successful, ${partialCount} partial, ${failCount} failed extractions`,
      data: {
        packageId,
        propertyAddress,
        processedDocuments,
        extractionSummary: { successCount, partialCount, failCount }
      }
    };

  } catch (error) {
    console.error("#underwrite route error:", error);
    await logEmailFailure('underwrite', emailData.emailRef, `Processing error: ${error}`);
    return {
      success: false,
      message: `#underwrite processing failed: ${error}`
    };
  }
}

async function extractLeaseTerms(docText: string): Promise<any> {
  try {
    const response = await callAI([
      {
        role: "system",
        content: `${ANTI_HALLUCINATION_INSTRUCTION}

You are extracting lease terms from commercial real estate lease documents. Extract specific financial and lease terms from the provided text.

Return a JSON object with two parts:
1. extractedData: the actual lease terms
2. fieldConfidence: confidence level for each field ("high", "medium", "low")

LEASE TERMS TO EXTRACT:
- tenantName: tenant business name
- suite: suite/unit number 
- areaSF: leased area in square feet (number)
- baseRentPSF: base rent per square foot (number)
- rentType: "net", "gross", or "modified gross"
- leaseStart: lease commencement date (YYYY-MM-DD format)
- leaseExpiry: lease expiry date (YYYY-MM-DD format)
- termMonths: lease term in months (number)
- tiAllowance: tenant improvement allowance (number)
- operatingExpenses: annual operating expenses if mentioned (number)
- escalations: escalation schedule description (text)
- renewalOptions: renewal option terms (text)
- propertyAddress: property address if mentioned
- specialClauses: any special lease terms (text)

CONFIDENCE SCORING:
- "high": explicitly stated with clear numbers/dates
- "medium": reasonably inferred from context  
- "low": uncertain or estimated

Example response:
{
  "extractedData": {
    "tenantName": "ABC Medical Clinic",
    "suite": "Suite 200",
    "areaSF": 2500,
    "baseRentPSF": 18.50,
    "rentType": "net",
    "leaseStart": "2024-01-01",
    "leaseExpiry": "2029-12-31",
    "termMonths": 72,
    "tiAllowance": 25000
  },
  "fieldConfidence": {
    "tenantName": "high",
    "suite": "high", 
    "areaSF": "high",
    "baseRentPSF": "high",
    "rentType": "medium",
    "leaseStart": "high",
    "leaseExpiry": "high",
    "termMonths": "high",
    "tiAllowance": "medium"
  }
}`
      },
      {
        role: "user",
        content: `Extract lease terms from this document:\n\n${docText.slice(0, 8000)}`
      }
    ], 4000);

    return JSON.parse(response);
  } catch (error) {
    console.error("Lease extraction error:", error);
    return null;
  }
}

async function logEmailFailure(tag: string, emailRef: any, errorReason: string): Promise<void> {
  try {
    const failureData = {
      timestamp: new Date().toISOString(),
      tag: tag,
      sourceRef: `${emailRef.from} - "${emailRef.subject}"`,
      errorReason: errorReason,
      messageId: emailRef.messageId
    };

    // Log to JSON file for digest pickup
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
    
    // Keep only last 100 failures to prevent file from growing too large
    if (failures.length > 100) {
      failures = failures.slice(-100);
    }

    fs.writeFileSync(failuresPath, JSON.stringify(failures, null, 2));
    
    console.log(`Email failure logged: @${tag} - ${errorReason}`);
  } catch (error) {
    console.error("Failed to log email failure:", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error("Missing or invalid authorization header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (!NOVA_EMAIL_SECRET || token !== NOVA_EMAIL_SECRET) {
      console.error("Invalid API secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const rawPayload = await req.json();
    
    // If worker sent raw email, parse it server-side with mailparser
    let emailData: EmailPayload;
    if (rawPayload.rawEmail) {
      console.log("Parsing raw email server-side...");
      const rawBuffer = Buffer.from(rawPayload.rawEmail, "base64");
      const parsed = await simpleParser(rawBuffer);
      
      const attachments: EmailPayload["attachments"] = [];
      if (parsed.attachments && parsed.attachments.length > 0) {
        for (const att of parsed.attachments) {
          attachments.push({
            filename: att.filename || "attachment",
            contentType: att.contentType || "application/octet-stream",
            size: att.size || att.content.length,
            data: att.content.toString("base64"),
          });
          console.log(`  Parsed attachment: ${att.filename} (${att.contentType}, ${att.size} bytes)`);
        }
      }
      
      emailData = {
        from: rawPayload.from || parsed.from?.text || "",
        to: rawPayload.to || parsed.to?.text || "",
        subject: rawPayload.subject || parsed.subject || "",
        body: parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""),
        messageId: parsed.messageId || "",
        attachments,
        receivedAt: rawPayload.receivedAt || new Date().toISOString(),
        authenticated: rawPayload.authenticated,
        authResults: rawPayload.authResults,
      };
      console.log(`Parsed raw email: ${attachments.length} attachments, body length: ${emailData.body.length}`);
    } else {
      emailData = rawPayload as EmailPayload;
    }
    
    console.log(`Received email from ${emailData.from}: "${emailData.subject}"`);

    // Defense in depth: Verify that the worker marked email as authenticated
    if (!emailData.authenticated) {
      console.error(`Email from ${emailData.from} rejected - worker did not mark as authenticated`);
      return NextResponse.json({ 
        error: "Email not authenticated",
        message: "Email failed authentication verification"
      }, { status: 403 });
    }

    // Additional verification: Check authentication results if provided
    if (emailData.authResults && (!emailData.authResults.spfPass || !emailData.authResults.dkimPass)) {
      console.error(`Email from ${emailData.from} rejected - auth results indicate failure:`, emailData.authResults);
      return NextResponse.json({ 
        error: "Authentication failed", 
        message: "Email failed SPF or DKIM verification"
      }, { status: 403 });
    }

    // Sender whitelist check (additional layer)
    if (!isWhitelisted(emailData.from)) {
      console.warn(`Email from ${emailData.from} rejected - not in whitelist`);
      return NextResponse.json({ 
        error: "Sender not whitelisted",
        message: "Only authorized senders can submit emails to Nova"
      }, { status: 403 });
    }

    // Process attachments (handle TNEF, etc.)
    console.log(`Raw attachments received: ${emailData.attachments?.length || 0}`);
    if (emailData.attachments && emailData.attachments.length > 0) {
      for (const att of emailData.attachments) {
        console.log(`  Attachment: ${att.filename} (${att.contentType}, data length: ${att.data?.length || 0})`);
      }
    }
    const processedAttachments = await processAttachments(emailData.attachments);
    console.log(`Processed ${processedAttachments.length} attachments`);

    // Extract #tag from subject or body
    let tag = extractTagFromText(emailData.subject);
    if (!tag) {
      tag = extractTagFromText(emailData.body);
    }

    // Parse forwarded email if needed
    const { instructions, context } = parseForwardedEmail(emailData.body);

    // Prepare email reference metadata
    const emailRef = {
      from: emailData.from,
      subject: emailData.subject,
      receivedAt: emailData.receivedAt,
      messageId: emailData.messageId,
      hasAttachments: processedAttachments.length > 0,
      attachmentCount: processedAttachments.length
    };

    if (tag) {
      // Route to appropriate handler
      const result = await routeToHandler(tag, {
        ...emailData,
        instructions,
        context,
        emailRef
      }, processedAttachments);

      return NextResponse.json({
        success: result.success,
        message: result.message,
        tag: tag,
        emailRef,
        data: result.data
      });

    } else {
      // No #tag found - save as unprocessed for manual review
      console.log("No #tag found in email, saving as unprocessed");
      
      // For now, just log this. Later we might create an "unprocessed" table
      // or add to a queue for manual review
      
      return NextResponse.json({
        success: true,
        message: "No #tag found - saved for manual review",
        emailRef,
        requiresManualReview: true
      });
    }

  } catch (error) {
    console.error("Email inbound processing failed:", error);
    return NextResponse.json({ 
      error: "Processing failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Health check endpoint
  return NextResponse.json({ 
    status: "Nova Email Intake API", 
    timestamp: new Date().toISOString() 
  });
}