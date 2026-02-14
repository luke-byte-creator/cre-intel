import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });

  const filename = `${Date.now()}-${file.name}`;
  const filepath = join(uploadDir, filename);
  await writeFile(filepath, buffer);

  const ext = file.name.split(".").pop()?.toLowerCase();
  let fileType: string;
  let preview: Record<string, unknown> = {};

  if (ext === "pdf") {
    fileType = "pdf";
    preview = {
      filename: file.name,
      size: buffer.length,
      type: "PDF Document",
      message: "PDF uploaded. Parser will extract corporate registry, building permits, or other structured data.",
      suggestedParser: file.name.toLowerCase().includes("permit")
        ? "building_permit"
        : file.name.toLowerCase().includes("corporate") || file.name.toLowerCase().includes("registry")
        ? "corporate_registry"
        : "auto_detect",
    };
  } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    fileType = "spreadsheet";
    preview = {
      filename: file.name,
      size: buffer.length,
      type: ext === "csv" ? "CSV" : "Excel Spreadsheet",
      message: "Spreadsheet uploaded. Parser will extract transfer list, property data, or tabular records.",
      suggestedParser: file.name.toLowerCase().includes("transfer")
        ? "transfer_list"
        : "auto_detect",
    };
  } else {
    fileType = "unknown";
    preview = {
      filename: file.name,
      size: buffer.length,
      type: "Unknown",
      message: "Unsupported file type. Please upload PDF or Excel files.",
    };
  }

  return NextResponse.json({
    success: true,
    fileType,
    filepath: filename,
    preview,
  });
}
