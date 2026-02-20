import JSZip from "jszip";
import fs from "fs";

// Security constants for file processing
const MAX_DECOMPRESSED_SIZE = 50 * 1024 * 1024; // 50MB total decompressed content
const MAX_INDIVIDUAL_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file within zip

interface ReplaceAllChange {
  type: "replace_all";
  old: string;
  new: string;
}

interface ReplaceValueChange {
  type: "replace_value";
  context: string; // surrounding text to locate the right spot
  old: string;
  new: string;
}

interface ReplaceSectionChange {
  type: "replace_section";
  find: string; // text to find (doesn't need to be perfect — we fuzzy match)
  replace: string;
}

interface AddAfterChange {
  type: "add_after";
  anchor: string; // text to find as insertion point
  content: string; // new content to add after the anchor
}

export type DocumentChange = ReplaceAllChange | ReplaceValueChange | ReplaceSectionChange | AddAfterChange;

// ─── Security validation for DOCX files ───

/**
 * Validate DOCX file for security threats before processing.
 * Checks decompressed size limits and validates file structure.
 * 
 * Note on XXE Protection:
 * This implementation uses JSZip for extraction and string-based regex processing 
 * for XML content, NOT an XML parser. This approach inherently protects against
 * XXE attacks since:
 * 1. JSZip treats .docx as a regular zip archive
 * 2. XML content is processed as plain text with regex/string methods
 * 3. No XML parser is used that could resolve external entities or DTDs
 * 4. Even if malicious XML entities are present, they remain as text and are not processed
 */
async function validateDocxSecurity(zip: JSZip): Promise<void> {
  let totalDecompressedSize = 0;
  
  // Validate essential DOCX structure first
  if (!zip.file("word/document.xml")) {
    throw new Error("Security: Invalid .docx structure - missing word/document.xml");
  }
  
  // Check for suspicious file names that might indicate zip bombs or traversal attacks
  for (const filename of Object.keys(zip.files)) {
    if (filename.includes("..") || filename.startsWith("/") || filename.includes("\\")) {
      throw new Error(`Security: Suspicious filename detected: ${filename}`);
    }
  }
  
  // Check decompressed sizes by actually reading content (but only for key files to avoid performance issues)
  const filesToCheck = ["word/document.xml", "word/styles.xml", "word/numbering.xml"];
  
  for (const filename of filesToCheck) {
    const file = zip.file(filename);
    if (file && !file.dir) {
      try {
        const content = await file.async("string");
        const size = content.length;
        
        if (size > MAX_INDIVIDUAL_FILE_SIZE) {
          throw new Error(
            `Security: File '${filename}' exceeds size limit (${size} > ${MAX_INDIVIDUAL_FILE_SIZE} bytes)`
          );
        }
        
        totalDecompressedSize += size;
      } catch (error) {
        if (error instanceof Error && error.message.includes("Security:")) {
          throw error; // Re-throw security errors
        }
        // Ignore files that can't be read as strings (binary files)
      }
    }
  }
  
  // For a more comprehensive check, we can estimate total size based on a sample
  // This is a reasonable security measure without reading every file
  if (totalDecompressedSize > MAX_DECOMPRESSED_SIZE / 4) {
    // If just the main XML files exceed 1/4 of our limit, the total is likely too big
    throw new Error(
      `Security: Estimated total decompressed size may exceed limit based on key files (${totalDecompressedSize * 4} estimated > ${MAX_DECOMPRESSED_SIZE} bytes)`
    );
  }
}

// ─── XML text utilities ───

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ─── Text map: maps character positions in concatenated text → XML <w:t> elements ───

interface TextSegment {
  xmlStart: number; // position of the full <w:t>...</w:t> tag in the XML string
  xmlEnd: number;
  textStart: number; // position in the concatenated plain text
  textEnd: number;
  text: string; // unescaped text content
}

function buildTextMap(xml: string): { segments: TextSegment[]; fullText: string } {
  // Match both <w:t> elements AND paragraph/table-row/tab boundaries so that
  // the concatenated fullText contains whitespace between paragraphs — otherwise
  // multi-line replace_section searches can never match.
  const regex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<\/w:tr>|<w:tab\/?>|<w:br\/?>|<w:cr\/?>/g;
  const segments: TextSegment[] = [];
  let fullText = "";
  let match;

  while ((match = regex.exec(xml)) !== null) {
    if (match[1] !== undefined) {
      // <w:t> element — real text
      const text = unescapeXml(match[1]);
      segments.push({
        xmlStart: match.index,
        xmlEnd: match.index + match[0].length,
        textStart: fullText.length,
        textEnd: fullText.length + text.length,
        text,
      });
      fullText += text;
    } else {
      // Boundary tag — inject synthetic whitespace into fullText (no segment)
      // This makes paragraph breaks visible for fuzzy matching
      const tag = match[0];
      if (tag.startsWith("</w:p>") || tag.startsWith("</w:tr>")) {
        fullText += "\n";
      } else {
        // tab, br, cr
        fullText += " ";
      }
    }
  }

  return { segments, fullText };
}

// ─── Apply a single text replacement to XML, handling cross-run spans ───

// Find the enclosing <w:p>...</w:p> for a given XML position
function findEnclosingParagraph(xml: string, pos: number): { start: number; end: number; xml: string } | null {
  // Search backwards for <w:p or <w:p>
  let pStart = pos;
  while (pStart > 0) {
    pStart--;
    if (xml.startsWith("<w:p>", pStart) || xml.startsWith("<w:p ", pStart)) break;
    if (pStart === 0) return null;
  }
  // Find closing </w:p>
  const closeIdx = xml.indexOf("</w:p>", pos);
  if (closeIdx < 0) return null;
  const pEnd = closeIdx + 6;
  return { start: pStart, end: pEnd, xml: xml.slice(pStart, pEnd) };
}

// Extract the <w:pPr> (paragraph properties) and <w:rPr> (run properties) from a paragraph
function extractParaProps(paraXml: string): { pPr: string; rPr: string } {
  const pPrMatch = paraXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const rPrMatch = paraXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  return {
    pPr: pPrMatch ? pPrMatch[0] : "",
    rPr: rPrMatch ? rPrMatch[0] : "",
  };
}

function applyXmlReplacement(
  xml: string,
  segments: TextSegment[],
  fullText: string,
  matchStart: number,
  matchEnd: number,
  replacement: string,
): string {
  // Find affected segments
  const affected = segments.filter(s => s.textEnd > matchStart && s.textStart < matchEnd);
  if (affected.length === 0) return xml;

  // Check if replacement contains newlines — if so, we need to create new paragraphs
  const hasNewlines = replacement.includes("\n");

  if (!hasNewlines) {
    // Simple case: single-line replacement — just edit <w:t> content
    let result = xml;
    for (let i = affected.length - 1; i >= 0; i--) {
      const seg = affected[i];
      const segMatchStart = Math.max(0, matchStart - seg.textStart);
      const segMatchEnd = Math.min(seg.text.length, matchEnd - seg.textStart);

      let newText: string;
      if (i === 0) {
        newText = seg.text.slice(0, segMatchStart) + replacement + seg.text.slice(segMatchEnd);
      } else {
        newText = seg.text.slice(0, segMatchStart) + seg.text.slice(segMatchEnd);
      }

      const origTag = result.slice(seg.xmlStart, seg.xmlEnd);
      const tagOpenMatch = origTag.match(/<w:t(?:\s[^>]*)?>/);
      let tagOpen = tagOpenMatch ? tagOpenMatch[0] : "<w:t>";

      if (/^\s|\s$/.test(newText) && !tagOpen.includes("xml:space")) {
        tagOpen = tagOpen.replace(">", ' xml:space="preserve">');
      }

      const newElement = `${tagOpen}${escapeXml(newText)}</w:t>`;
      result = result.slice(0, seg.xmlStart) + newElement + result.slice(seg.xmlEnd);
    }
    return result;
  }

  // Multi-line replacement: need to handle paragraph structure
  // Strategy: put the first line in the first affected segment's <w:t>,
  // clear subsequent affected segments, then insert new <w:p> elements
  // after the first affected paragraph for remaining lines.

  const lines = replacement.split("\n");
  const firstSeg = affected[0];

  // Get paragraph properties from the first affected segment's paragraph
  const para = findEnclosingParagraph(xml, firstSeg.xmlStart);
  const { pPr, rPr } = para ? extractParaProps(para.xml) : { pPr: "", rPr: "" };

  // Step 1: Clear all affected segments, put first line in first segment
  let result = xml;
  for (let i = affected.length - 1; i >= 0; i--) {
    const seg = affected[i];
    const segMatchStart = Math.max(0, matchStart - seg.textStart);
    const segMatchEnd = Math.min(seg.text.length, matchEnd - seg.textStart);

    let newText: string;
    if (i === 0) {
      newText = seg.text.slice(0, segMatchStart) + lines[0] + seg.text.slice(segMatchEnd);
    } else {
      newText = seg.text.slice(0, segMatchStart) + seg.text.slice(segMatchEnd);
    }

    const origTag = result.slice(seg.xmlStart, seg.xmlEnd);
    const tagOpenMatch = origTag.match(/<w:t(?:\s[^>]*)?>/);
    let tagOpen = tagOpenMatch ? tagOpenMatch[0] : "<w:t>";

    if (/^\s|\s$/.test(newText) && !tagOpen.includes("xml:space")) {
      tagOpen = tagOpen.replace(">", ' xml:space="preserve">');
    }

    const newElement = `${tagOpen}${escapeXml(newText)}</w:t>`;
    result = result.slice(0, seg.xmlStart) + newElement + result.slice(seg.xmlEnd);
  }

  // Step 2: Insert new paragraphs for remaining lines after the first affected paragraph's </w:p>
  if (lines.length > 1) {
    // Re-find the paragraph boundary (positions may have shifted)
    const updatedPara = findEnclosingParagraph(result, firstSeg.xmlStart);
    if (updatedPara) {
      const insertPos = updatedPara.end;
      const newParagraphs = lines.slice(1).map(line => {
        const runProps = rPr ? `${rPr}` : "";
        const tagOpen = /^\s|\s$/.test(line)
          ? '<w:t xml:space="preserve">'
          : "<w:t>";
        return `<w:p>${pPr}<w:r>${runProps}${tagOpen}${escapeXml(line)}</w:t></w:r></w:p>`;
      }).join("");
      result = result.slice(0, insertPos) + newParagraphs + result.slice(insertPos);
    }
  }

  return result;
}

// ─── Normalize whitespace for fuzzy matching ───

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Find a substring using normalized whitespace, returns [start, end] in the original string
function fuzzyFind(haystack: string, needle: string): [number, number] | null {
  // Exact match first
  const exactIdx = haystack.indexOf(needle);
  if (exactIdx >= 0) return [exactIdx, exactIdx + needle.length];

  // Normalized match
  const needleNorm = normalizeWs(needle);
  if (!needleNorm) return null;

  // Build a normalized version with position mapping
  // For each character in normalized, track where it came from in original
  const origPositions: number[] = [];
  let inSpace = false;
  let trimStart = 0;
  // Skip leading whitespace
  while (trimStart < haystack.length && /\s/.test(haystack[trimStart])) trimStart++;

  for (let i = trimStart; i < haystack.length; i++) {
    if (/\s/.test(haystack[i])) {
      if (!inSpace && origPositions.length > 0) {
        origPositions.push(i); // space character position
        inSpace = true;
      }
    } else {
      inSpace = false;
      origPositions.push(i);
    }
  }

  const haystackNorm = normalizeWs(haystack);
  const normIdx = haystackNorm.indexOf(needleNorm);
  if (normIdx < 0) return null;

  // Map back to original positions
  const origStart = origPositions[normIdx] ?? 0;
  const normEnd = normIdx + needleNorm.length;
  // Find the end in original: it's the character after the last matched position
  let origEnd: number;
  if (normEnd >= origPositions.length) {
    origEnd = haystack.length;
  } else {
    origEnd = origPositions[normEnd] ?? haystack.length;
  }

  // Expand origEnd to include any trailing whitespace from the original match
  while (origEnd < haystack.length && /\s/.test(haystack[origEnd]) && origEnd < origStart + needle.length * 2) {
    origEnd++;
  }

  return [origStart, origEnd];
}

// ─── Extract text from .docx XML (matches what buildTextMap produces) ───

export async function extractDocxXmlText(inputPath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(fileBuffer);
  
  // Security validation
  await validateDocxSecurity(zip);
  
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Invalid .docx: missing word/document.xml");
  const xml = await docXmlFile.async("string");
  const { fullText } = buildTextMap(xml);
  return fullText;
}

// ─── Apply structured changes to .docx ───

export async function applyChangesToDocx(
  inputPath: string,
  changes: DocumentChange[],
): Promise<{ buffer: Buffer; applied: number; total: number; log: string[] }> {
  const fileBuffer = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(fileBuffer);

  // Security validation
  await validateDocxSecurity(zip);

  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Invalid .docx: missing word/document.xml");

  let xml = await docXmlFile.async("string");
  let applied = 0;
  const log: string[] = [];

  for (const change of changes) {
    // Rebuild text map before each change (positions shift after edits)
    const { segments, fullText } = buildTextMap(xml);

    switch (change.type) {
      case "replace_all": {
        // Global find-replace — catches EVERY occurrence
        if (!change.old || !change.new) break;

        let count = 0;
        // Keep replacing until no more matches (rebuilding text map each time)
        let currentXml = xml;
        for (let safety = 0; safety < 100; safety++) {
          const { segments: segs, fullText: ft } = buildTextMap(currentXml);
          const idx = ft.indexOf(change.old);
          if (idx < 0) break;
          currentXml = applyXmlReplacement(currentXml, segs, ft, idx, idx + change.old.length, change.new);
          count++;
        }

        if (count > 0) {
          xml = currentXml;
          applied++;
          log.push(`✓ replace_all: "${change.old}" → "${change.new}" (${count} occurrences)`);
        } else {
          // Try case-insensitive / fuzzy
          const oldLower = change.old.toLowerCase();
          let currentXml2 = xml;
          let count2 = 0;
          for (let safety = 0; safety < 100; safety++) {
            const { segments: segs, fullText: ft } = buildTextMap(currentXml2);
            const idx = ft.toLowerCase().indexOf(oldLower);
            if (idx < 0) break;
            // Preserve case of surrounding text, replace the matched span
            currentXml2 = applyXmlReplacement(currentXml2, segs, ft, idx, idx + change.old.length, change.new);
            count2++;
          }
          if (count2 > 0) {
            xml = currentXml2;
            applied++;
            log.push(`✓ replace_all (case-insensitive): "${change.old}" → "${change.new}" (${count2} occurrences)`);
          } else {
            // Try normalized whitespace match
            let currentXml3 = xml;
            let count3 = 0;
            for (let safety = 0; safety < 100; safety++) {
              const { segments: segs, fullText: ft } = buildTextMap(currentXml3);
              const match = fuzzyFind(ft, change.old);
              if (!match) break;
              currentXml3 = applyXmlReplacement(currentXml3, segs, ft, match[0], match[1], change.new);
              count3++;
            }
            if (count3 > 0) {
              xml = currentXml3;
              applied++;
              log.push(`✓ replace_all (fuzzy): "${change.old}" → "${change.new}" (${count3} occurrences)`);
            } else {
              log.push(`✗ replace_all: could not find "${change.old.slice(0, 60)}"`);
            }
          }
        }
        break;
      }

      case "replace_value": {
        // Find the value within context, replace just the value
        if (!change.old || typeof change.new !== "string") break;

        // First try: find the context, then find the old value within/near it
        const contextMatch = fuzzyFind(fullText, change.context);
        if (contextMatch) {
          // Search for the old value within a window around the context
          const windowStart = Math.max(0, contextMatch[0] - 200);
          const windowEnd = Math.min(fullText.length, contextMatch[1] + 200);
          const window = fullText.slice(windowStart, windowEnd);
          const valueIdx = window.indexOf(change.old);

          if (valueIdx >= 0) {
            const absStart = windowStart + valueIdx;
            const absEnd = absStart + change.old.length;
            xml = applyXmlReplacement(xml, segments, fullText, absStart, absEnd, change.new);
            applied++;
            log.push(`✓ replace_value: "${change.old}" → "${change.new}" near "${change.context.slice(0, 40)}"`);
          } else {
            // Try fuzzy match within window
            const fuzzyVal = fuzzyFind(window, change.old);
            if (fuzzyVal) {
              const absStart = windowStart + fuzzyVal[0];
              const absEnd = windowStart + fuzzyVal[1];
              xml = applyXmlReplacement(xml, segments, fullText, absStart, absEnd, change.new);
              applied++;
              log.push(`✓ replace_value (fuzzy): "${change.old}" → "${change.new}" near "${change.context.slice(0, 40)}"`);
            } else {
              log.push(`✗ replace_value: found context but not value "${change.old}" near "${change.context.slice(0, 40)}"`);
            }
          }
        } else {
          // Fallback: just find the old value anywhere
          const idx = fullText.indexOf(change.old);
          if (idx >= 0) {
            xml = applyXmlReplacement(xml, segments, fullText, idx, idx + change.old.length, change.new);
            applied++;
            log.push(`✓ replace_value (no context): "${change.old}" → "${change.new}"`);
          } else {
            log.push(`✗ replace_value: could not find "${change.old}" or context "${change.context.slice(0, 40)}"`);
          }
        }
        break;
      }

      case "replace_section": {
        if (!change.find || typeof change.replace !== "string") break;

        const match = fuzzyFind(fullText, change.find);
        if (match) {
          xml = applyXmlReplacement(xml, segments, fullText, match[0], match[1], change.replace);
          applied++;
          log.push(`✓ replace_section: "${change.find.slice(0, 50)}..." → "${change.replace.slice(0, 50)}..."`);
        } else {
          log.push(`✗ replace_section: could not find "${change.find.slice(0, 60)}"`);
        }
        break;
      }

      case "add_after": {
        if (!change.anchor || !change.content) break;

        const match = fuzzyFind(fullText, change.anchor);
        if (match) {
          // Insert content right after the anchor
          xml = applyXmlReplacement(xml, segments, fullText, match[0], match[1], fullText.slice(match[0], match[1]) + change.content);
          applied++;
          log.push(`✓ add_after: added content after "${change.anchor.slice(0, 40)}"`);
        } else {
          log.push(`✗ add_after: could not find anchor "${change.anchor.slice(0, 60)}"`);
        }
        break;
      }
    }
  }

  zip.file("word/document.xml", xml);
  const outputBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return { buffer: outputBuffer, applied, total: changes.length, log };
}

// ─── Apply structured changes to plain text (for PDF/legacy fallback) ───

export function applyChangesToText(text: string, changes: DocumentChange[]): { text: string; applied: number; log: string[] } {
  let result = text;
  let applied = 0;
  const log: string[] = [];

  for (const change of changes) {
    switch (change.type) {
      case "replace_all": {
        if (!change.old) break;
        const count = (result.split(change.old).length - 1);
        if (count > 0) {
          result = result.split(change.old).join(change.new);
          applied++;
          log.push(`✓ replace_all: "${change.old}" → "${change.new}" (${count}x)`);
        } else {
          log.push(`✗ replace_all: not found "${change.old.slice(0, 60)}"`);
        }
        break;
      }
      case "replace_value": {
        if (!change.old) break;
        const idx = result.indexOf(change.old);
        if (idx >= 0) {
          result = result.slice(0, idx) + change.new + result.slice(idx + change.old.length);
          applied++;
          log.push(`✓ replace_value: "${change.old}" → "${change.new}"`);
        }
        break;
      }
      case "replace_section": {
        if (!change.find) break;
        const match = fuzzyFind(result, change.find);
        if (match) {
          result = result.slice(0, match[0]) + change.replace + result.slice(match[1]);
          applied++;
          log.push(`✓ replace_section`);
        }
        break;
      }
      case "add_after": {
        if (!change.anchor) break;
        const idx = result.indexOf(change.anchor);
        if (idx >= 0) {
          const insertAt = idx + change.anchor.length;
          result = result.slice(0, insertAt) + change.content + result.slice(insertAt);
          applied++;
          log.push(`✓ add_after`);
        }
        break;
      }
    }
  }

  return { text: result, applied, log };
}
