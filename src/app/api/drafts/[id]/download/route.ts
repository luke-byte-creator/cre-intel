import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";

function markdownToDocx(text: string): Paragraph[] {
  const lines = text.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Blank line → empty paragraph (spacing)
    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: parseInlineFormatting(trimmed.slice(4)),
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: parseInlineFormatting(trimmed.slice(3)),
          spacing: { before: 360, after: 120 },
        })
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: parseInlineFormatting(trimmed.slice(2)),
          spacing: { before: 360, after: 200 },
        })
      );
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" },
          },
          spacing: { before: 200, after: 200 },
        })
      );
      continue;
    }

    // Bullet points
    if (/^[-*•]\s/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineFormatting(trimmed.replace(/^[-*•]\s+/, "")),
          spacing: { after: 60 },
        })
      );
      continue;
    }

    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (numMatch) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(numMatch[0]),
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
      continue;
    }

    // Regular paragraph
    paragraphs.push(
      new Paragraph({
        children: parseInlineFormatting(trimmed),
        spacing: { after: 120 },
      })
    );
  }

  return paragraphs;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Match **bold**, *italic*, [BLANK]
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|\[BLANK\])/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: 22 }));
    }

    if (match[0] === "[BLANK]") {
      runs.push(new TextRun({ text: "____________", size: 22, underline: {} }));
    } else if (match[2]) {
      // **bold**
      runs.push(new TextRun({ text: match[2], bold: true, size: 22 }));
    } else if (match[3]) {
      // *italic*
      runs.push(new TextRun({ text: match[3], italics: true, size: 22 }));
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: 22 }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 22 }));
  }

  return runs;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rows = await db
    .select()
    .from(schema.documentDrafts)
    .where(eq(schema.documentDrafts.id, Number(id)));
  if (!rows.length) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const draft = rows[0];
  const filename = `${(draft.title || "draft").replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_")}.docx`;

  // Check for pre-built .docx files (from direct XML editing)
  const possiblePaths = [
    draft.finalDocPath,
    // extractedStructure stores the output path when it's a .docx path
    draft.extractedStructure?.endsWith(".docx") ? draft.extractedStructure : null,
    path.join(process.cwd(), "data", "drafts", `${draft.id}.docx`),
  ].filter(Boolean) as string[];

  for (const docxPath of possiblePaths) {
    if (fs.existsSync(docxPath)) {
      const fileBuffer = fs.readFileSync(docxPath);
      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(fileBuffer.length),
        },
      });
    }
  }

  // Fallback: generate .docx from text content (for PDF-sourced or legacy drafts)
  const content = draft.generatedContent || "";

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          // Title
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: draft.title || "Draft Document", size: 32, bold: true })],
            spacing: { after: 400 },
          }),
          ...markdownToDocx(content),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
