import fs from "fs";

export async function extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  if (mimeType === "application/pdf" || filePath.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType.includes("spreadsheet") || filePath.endsWith(".xlsx") || filePath.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer);
    let text = "";
    for (const name of workbook.SheetNames) {
      text += `\n--- Sheet: ${name} ---\n`;
      text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    }
    return text;
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || filePath.endsWith(".docx")) {
    // Simple DOCX text extraction via xml parsing
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      // Fallback to plain text
      return buffer.toString("utf-8");
    }
  }

  // Plain text fallback
  return buffer.toString("utf-8");
}
