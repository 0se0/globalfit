import "pdf-parse/worker";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20000;

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const ext = extensionOf(file.name);

  if (ext === "hwp") {
    return NextResponse.json({ error: "hwp_unsupported" }, { status: 415 });
  }
  if (!["pdf", "docx", "html", "htm"].includes(ext)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (ext === "pdf") {
      text = await extractPdf(buffer);
    } else if (ext === "docx") {
      text = await extractDocx(buffer);
    } else {
      text = extractHtml(buffer.toString("utf-8"));
    }

    text = text.replace(/\s+/g, " ").trim();

    if (text.length === 0) {
      return NextResponse.json({ error: "empty_content" }, { status: 422 });
    }

    return NextResponse.json({ text: text.slice(0, MAX_TEXT_LENGTH) });
  } catch {
    return NextResponse.json({ error: "parse_failed" }, { status: 500 });
  }
}
