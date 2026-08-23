import * as cheerio from "cheerio";
import { NextResponse } from "next/server";

const FETCH_TIMEOUT_MS = 8000;
const MIN_TEXT_LENGTH = 200;
const MAX_TEXT_LENGTH = 20000;

export async function POST(request: Request) {
  const { url } = (await request.json()) as { url?: string };

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    $("script, style, nav, header, footer, aside, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (text.length < MIN_TEXT_LENGTH) {
      // JS 렌더링 사이트는 서버측 fetch로는 본문이 비어있는 채로 오는 경우가 많음 —
      // 별도 감지 로직 없이 "본문이 너무 짧음"으로 뭉뚱그려 실패 처리
      return NextResponse.json({ error: "content_too_short" }, { status: 422 });
    }

    return NextResponse.json({ text: text.slice(0, MAX_TEXT_LENGTH) });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
