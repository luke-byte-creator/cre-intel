import JSZip from "jszip";
import fs from "fs";

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
  const regex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  const segments: TextSegment[] = [];
  let fullText = "";
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const text = unescapeXml(match[1]);
    segments.push({
      xmlStart: match.index,
      xmlEnd: match.index + match[0].length,
      textStart: fullText.length,
      textEnd: fullText.length + text.length,
      text,
    });
    fullText += text;
  }

  return { segments, fullText };
}

// ─── Apply a single text replacement to XML, handling cross-run spans ───

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

  // Work backwards to preserve XML positions
  let result = xml;
  for (let i = affected.length - 1; i >= 0; i--) {
    const seg = affected[i];
    const segMatchStart = Math.max(0, matchStart - seg.textStart);
    const segMatchEnd = Math.min(seg.text.length, matchEnd - seg.textStart);

    let newText: string;
    if (i === 0) {
      // First segment: keep prefix, insert replacement, keep suffix
      newText = seg.text.slice(0, segMatchStart) + replacement + seg.text.slice(segMatchEnd);
    } else {
      // Later segments: just remove the matched portion
      newText = seg.text.slice(0, segMatchStart) + seg.text.slice(segMatchEnd);
    }

    // Rebuild the <w:t> element
    const origTag = xml.slice(seg.xmlStart, seg.xmlEnd);
    const tagOpenMatch = origTag.match(/<w:t(?:\s[^>]*)?>/);
    let tagOpen = tagOpenMatch ? tagOpenMatch[0] : "<w:t>";

    // Ensure xml:space="preserve" if text has leading/trailing whitespace
    if (/^\s|\s$/.test(newText) && !tagOpen.includes("xml:space")) {
      tagOpen = tagOpen.replace(">", ' xml:space="preserve">');
    }

    const newElement = `${tagOpen}${escapeXml(newText)}</w:t>`;
    result = result.slice(0, seg.xmlStart) + newElement + result.slice(seg.xmlEnd);
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

// ─── Apply structured changes to .docx ───

export async function applyChangesToDocx(
  inputPath: string,
  changes: DocumentChange[],
): Promise<{ buffer: Buffer; applied: number; total: number; log: string[] }> {
  const fileBuffer = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(fileBuffer);

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
            log.push(`✗ replace_all: could not find "${change.old.slice(0, 60)}"`);
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
            log.push(`✗ replace_value: found context but not value "${change.old}" near "${change.context.slice(0, 40)}"`);
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
