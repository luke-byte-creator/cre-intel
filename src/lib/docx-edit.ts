import JSZip from "jszip";
import fs from "fs";

/**
 * Apply find-and-replace operations directly inside a .docx file's XML,
 * preserving all formatting, styles, images, etc.
 */
export async function applyChangesToDocx(
  inputPath: string,
  changes: Array<{ find: string; replace: string }>,
): Promise<{ buffer: Buffer; applied: number; total: number }> {
  const fileBuffer = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(fileBuffer);

  const docXml = zip.file("word/document.xml");
  if (!docXml) throw new Error("Invalid .docx: missing word/document.xml");

  let xmlContent = await docXml.async("string");

  // The text in a .docx XML is inside <w:t> tags, but a single phrase
  // can be split across multiple <w:r> (run) elements. We need to work
  // with the concatenated text content.

  // Strategy: extract all text, build a position map, then do replacements
  // on the raw XML by finding text spans across runs.

  let applied = 0;

  for (const change of changes) {
    if (!change.find || typeof change.replace !== "string") continue;

    // Try direct XML text replacement first (works when text isn't split across runs)
    const escapedFind = escapeXmlText(change.find);
    const escapedReplace = escapeXmlText(change.replace);

    if (xmlContent.includes(escapedFind)) {
      xmlContent = xmlContent.replace(escapedFind, escapedReplace);
      applied++;
      continue;
    }

    // Text might be split across <w:r> elements. Reconstruct and search.
    const result = replaceAcrossRuns(xmlContent, change.find, change.replace);
    if (result) {
      xmlContent = result;
      applied++;
      continue;
    }

    // Try normalized whitespace match
    const resultNorm = replaceAcrossRunsNormalized(xmlContent, change.find, change.replace);
    if (resultNorm) {
      xmlContent = resultNorm;
      applied++;
      continue;
    }

    console.warn(`[docx-edit] Could not find: "${change.find.slice(0, 80)}..."`);
  }

  zip.file("word/document.xml", xmlContent);
  const outputBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return { buffer: outputBuffer, applied, total: changes.length };
}

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Replace text that spans across multiple <w:t> elements within <w:r> runs.
 * 
 * Approach: collect all <w:t> text nodes with their positions in the XML,
 * concatenate them to find the search string, then modify the XML directly.
 */
function replaceAcrossRuns(xml: string, find: string, replace: string): string | null {
  // Collect all <w:t> elements with their positions and text
  const wtRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  const segments: Array<{ start: number; end: number; textStart: number; textEnd: number; text: string }> = [];
  let match;
  let concatenated = "";

  while ((match = wtRegex.exec(xml)) !== null) {
    const text = unescapeXml(match[1]);
    segments.push({
      start: match.index,
      end: match.index + match[0].length,
      textStart: concatenated.length,
      textEnd: concatenated.length + text.length,
      text,
    });
    concatenated += text;
  }

  const findIdx = concatenated.indexOf(find);
  if (findIdx === -1) return null;

  const findEnd = findIdx + find.length;

  // Find which segments are affected
  const affectedSegments = segments.filter(
    (s) => s.textEnd > findIdx && s.textStart < findEnd
  );

  if (affectedSegments.length === 0) return null;

  // Put all replacement text in the first affected segment's <w:t>,
  // and empty out the rest
  let result = xml;
  // Work backwards to preserve positions
  for (let i = affectedSegments.length - 1; i >= 0; i--) {
    const seg = affectedSegments[i];
    const segFindStart = Math.max(0, findIdx - seg.textStart);
    const segFindEnd = Math.min(seg.text.length, findEnd - seg.textStart);

    let newText: string;
    if (i === 0) {
      // First segment: prefix + replacement + suffix
      newText = seg.text.slice(0, segFindStart) + replace + seg.text.slice(segFindEnd);
    } else {
      // Subsequent segments: prefix + suffix (remove the matched part)
      newText = seg.text.slice(0, segFindStart) + seg.text.slice(segFindEnd);
    }

    const escapedNewText = escapeXmlText(newText);
    // Rebuild the <w:t> element, preserving xml:space attribute
    const origTag = xml.slice(seg.start, seg.end);
    const tagOpen = origTag.match(/<w:t(?:\s[^>]*)?>/)?.[0] || "<w:t>";
    // If replacement has leading/trailing spaces, ensure xml:space="preserve"
    const needsPreserve = /^\s|\s$/.test(newText);
    const finalTagOpen = needsPreserve && !tagOpen.includes("xml:space")
      ? tagOpen.replace(">", ' xml:space="preserve">')
      : tagOpen;

    const newElement = `${finalTagOpen}${escapedNewText}</w:t>`;
    result = result.slice(0, seg.start) + newElement + result.slice(seg.end);
  }

  return result;
}

/**
 * Same as replaceAcrossRuns but with normalized whitespace matching.
 */
function replaceAcrossRunsNormalized(xml: string, find: string, replace: string): string | null {
  const wtRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  const segments: Array<{ start: number; end: number; textStart: number; textEnd: number; text: string }> = [];
  let match;
  let concatenated = "";

  while ((match = wtRegex.exec(xml)) !== null) {
    const text = unescapeXml(match[1]);
    segments.push({
      start: match.index,
      end: match.index + match[0].length,
      textStart: concatenated.length,
      textEnd: concatenated.length + text.length,
      text,
    });
    concatenated += text;
  }

  const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();
  const findNorm = normalizeWs(find);
  const concatNorm = normalizeWs(concatenated);

  const normIdx = concatNorm.indexOf(findNorm);
  if (normIdx === -1) return null;

  // Map normalized position back to original position
  // This is approximate — find the best match in the original
  // by looking for a substring that normalizes to the find string
  let bestStart = -1;
  let bestEnd = -1;
  for (let start = 0; start < concatenated.length; start++) {
    if (concatenated[start].toLowerCase() !== find[0]?.toLowerCase() &&
        concatenated[start] !== ' ' && find[0] !== ' ') continue;
    for (let end = start + find.length - 5; end <= Math.min(start + find.length * 3, concatenated.length); end++) {
      const candidate = concatenated.slice(start, end);
      if (normalizeWs(candidate) === findNorm) {
        bestStart = start;
        bestEnd = end;
        break;
      }
    }
    if (bestStart >= 0) break;
  }

  if (bestStart < 0) return null;

  // Now apply the same logic as replaceAcrossRuns
  const affectedSegments = segments.filter(
    (s) => s.textEnd > bestStart && s.textStart < bestEnd
  );

  if (affectedSegments.length === 0) return null;

  let result = xml;
  for (let i = affectedSegments.length - 1; i >= 0; i--) {
    const seg = affectedSegments[i];
    const segFindStart = Math.max(0, bestStart - seg.textStart);
    const segFindEnd = Math.min(seg.text.length, bestEnd - seg.textStart);

    let newText: string;
    if (i === 0) {
      newText = seg.text.slice(0, segFindStart) + replace + seg.text.slice(segFindEnd);
    } else {
      newText = seg.text.slice(0, segFindStart) + seg.text.slice(segFindEnd);
    }

    const escapedNewText = escapeXmlText(newText);
    const origTag = xml.slice(seg.start, seg.end);
    const tagOpen = origTag.match(/<w:t(?:\s[^>]*)?>/)?.[0] || "<w:t>";
    const needsPreserve = /^\s|\s$/.test(newText);
    const finalTagOpen = needsPreserve && !tagOpen.includes("xml:space")
      ? tagOpen.replace(">", ' xml:space="preserve">')
      : tagOpen;

    const newElement = `${finalTagOpen}${escapedNewText}</w:t>`;
    result = result.slice(0, seg.start) + newElement + result.slice(seg.end);
  }

  return result;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
