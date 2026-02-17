import { NextResponse } from "next/server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

import { countTokens } from "@/lib/server/tokenizer";

export const runtime = "nodejs";

const BLOCKED_EXTENSIONS = new Set([
  "pdf",
  "ppt",
  "pptx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "heic",
  "heif",
]);

const PLAINTEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "csv",
  "tsv",
  "log",
  "rtf",
]);

function extensionForFile(name: string): string {
  const parts = name.toLowerCase().split(".");
  if (parts.length < 2) {
    return "";
  }

  return parts[parts.length - 1];
}

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function workbookToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetTexts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csvText = XLSX.utils.sheet_to_csv(sheet, {
      blankrows: false,
      FS: "\t",
    });

    return `# Sheet: ${sheetName}\n${csvText}`.trim();
  }).filter((sheetText) => sheetText.length > 0);

  return sheetTexts.join("\n\n");
}

async function extractText(file: File): Promise<{ text: string; extension: string }> {
  const extension = extensionForFile(file.name);

  if (!extension) {
    throw new Error("Unsupported file type. Please include a valid file extension.");
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error("PDF, PowerPoint, and image uploads are not supported right now.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (extension === "doc") {
    throw new Error("Legacy .doc files are not supported. Please upload .docx files.");
  }

  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, extension };
  }

  if (extension === "xls" || extension === "xlsx") {
    return { text: workbookToText(buffer), extension };
  }

  if (PLAINTEXT_EXTENSIONS.has(extension)) {
    return { text: buffer.toString("utf8"), extension };
  }

  throw new Error(`Unsupported file type: .${extension}`);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const { text, extension } = await extractText(file);
    const normalizedText = normalizeText(text);

    if (!normalizedText) {
      return NextResponse.json(
        { error: "No readable text found in this file." },
        { status: 400 },
      );
    }

    const tokenCount = countTokens(normalizedText);

    return NextResponse.json({
      content: normalizedText,
      tokenCount,
      extension,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to ingest document.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
