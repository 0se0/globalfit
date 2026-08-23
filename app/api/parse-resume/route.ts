import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20000;
// PDF는 Gemini가 문서 이해(레이아웃/표 포함)를 공식 지원하는 유일한 파일
// 형식이라 라이브러리 텍스트 추출 대신 파일 자체를 그대로 읽게 함. DOCX/HTML은
// Gemini의 문서 이해가 비공식/텍스트 전용이라 기존 라이브러리 추출 유지
const GEMINI_MODEL = "gemini-3.6-flash";

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Extract this document as plain text. No commentary, no summary, no markdown formatting (no #, *, ** etc) — just the document's raw text content as-is.",
          },
          { inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } },
        ],
      },
    ],
  });
  return response.text ?? "";
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
