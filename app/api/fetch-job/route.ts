import chromium from "@sparticuz/chromium";
import * as cheerio from "cheerio";
import { NextResponse } from "next/server";
import puppeteer, { type Browser } from "puppeteer-core";

export const maxDuration = 60;

const NAV_TIMEOUT_MS = 20000;
const RENDER_WAIT_MS = 1500;
const MIN_TEXT_LENGTH = 200;
const MAX_TEXT_LENGTH = 20000;

const LOCAL_CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function isServerless(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchBrowser(): Promise<Browser> {
  // Vercel 서버리스는 @sparticuz/chromium의 경량 바이너리를 쓰고, 로컬 개발은
  // 이미 설치된 시스템 Chrome을 그대로 씀 — 둘 다 무료, 별도 API 키/결제 없음
  if (isServerless()) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return puppeteer.launch({
    executablePath: LOCAL_CHROME_PATH,
    headless: true,
  });
}

export async function POST(request: Request) {
  const { url } = (await request.json()) as { url?: string };

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    if (!response || !response.ok()) {
      // CDN/WAF 차단 페이지(예: CloudFront 403)는 본문 길이가 충분해서
      // content_too_short 체크를 통과해버림 — HTTP 상태로 먼저 걸러냄
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }

    // JS 렌더링이 domcontentloaded 이후 조금 더 걸리는 사이트가 많아서
    // networkidle을 기다리는 대신 짧게 고정 대기 — 광고/추적 스크립트가 계속
    // 떠 있는 사이트에서 networkidle이 영영 안 끝나는 걸 피하기 위함
    await new Promise((resolve) => setTimeout(resolve, RENDER_WAIT_MS));

    const html = await page.content();
    const $ = cheerio.load(html);
    $("script, style, nav, header, footer, aside, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (text.length < MIN_TEXT_LENGTH) {
      // 헤드리스 브라우저로도 본문이 비어있으면 봇 탐지 차단(BMW의 Akamai 등)일
      // 가능성이 높음 — 이 경우를 우회하는 코드는 넣지 않고 그대로 실패 처리
      return NextResponse.json({ error: "content_too_short" }, { status: 422 });
    }

    return NextResponse.json({ text: text.slice(0, MAX_TEXT_LENGTH) });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  } finally {
    await browser?.close();
  }
}
