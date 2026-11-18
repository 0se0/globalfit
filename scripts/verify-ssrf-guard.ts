// 실행: npx vite-node scripts/verify-ssrf-guard.ts   (로컬에 Chrome 필요, CHROME_PATH로 경로 지정 가능)
//
// 진짜 Chrome으로 리다이렉트·하위 리소스 우회를 검증한다. 도메인 이름 세 개(a/b/c.test)를 Chrome의
// 호스트 매핑으로 로컬 서버 하나에 연결하고, 방어 쪽 DNS 조회는 b.test만 내부 주소로 답하게 한다.
// 판정 기준은 "내부(b.test) 서버가 접속을 한 번이라도 받았는가"이며, 방어를 끈 상태에서는 접속이
// 발생해야 이 검증이 유효하다는 뜻이다.
import http from "node:http";
import puppeteer from "puppeteer-core";
import { guardBrowserRequests } from "../lib/guard-browser-requests";
import type { HostResolver } from "../lib/safe-url";

const PORT = 18080;
const CHROME_PATH = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DNS: Record<string, string> = { "a.test": "93.184.216.34", "c.test": "93.184.216.35", "b.test": "10.0.0.5" };
const resolve: HostResolver = async (hostname) => {
  const address = DNS[hostname];
  if (!address) throw new Error(`unknown host ${hostname}`);
  return [address];
};

const hits = new Map<string, string[]>();
const server = http.createServer((req, res) => {
  const host = req.headers.host ?? "";
  hits.set(host, [...(hits.get(host) ?? []), req.url ?? ""]);
  const send = (status: number, body: string, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
    res.end(body);
  };
  if (host === "a.test" && req.url === "/to-internal") return send(302, "", { Location: "http://b.test/secret" });
  if (host === "a.test" && req.url === "/to-public") return send(302, "", { Location: "http://c.test/ok" });
  if (host === "c.test" && req.url === "/ok") return send(200, "<p>PUBLIC-OK</p>");
  if (host === "c.test" && req.url === "/with-subresource") {
    return send(200, `<p>PAGE</p><script src="http://b.test/evil.js"></script><script>fetch("http://b.test/xhr").catch(() => {});</script>`);
  }
  return send(200, "<p>INTERNAL-SECRET</p>");
});

async function visit(url: string, guarded: boolean): Promise<{ finalText: string; internalHits: number }> {
  hits.clear();
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [`--host-resolver-rules=MAP a.test 127.0.0.1:${PORT}, MAP b.test 127.0.0.1:${PORT}, MAP c.test 127.0.0.1:${PORT}`],
  });
  try {
    const page = await browser.newPage();
    if (guarded) await guardBrowserRequests(page, resolve);
    let finalText = "";
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      finalText = await page.evaluate(() => document.body?.innerText ?? "");
    } catch {
      finalText = "(이동 실패)";
    }
    await new Promise((r) => setTimeout(r, 800)); // 하위 리소스 요청이 서버에 닿을 시간
    return { finalText, internalHits: hits.get("b.test")?.length ?? 0 };
  } finally {
    await browser.close();
  }
}

const scenarios = [
  { name: "공개 사이트가 내부 주소로 리다이렉트", url: "http://a.test/to-internal" },
  { name: "페이지가 스크립트·fetch로 내부 주소 호출", url: "http://c.test/with-subresource" },
];

async function main() {
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
  let failed = false;
  try {
    for (const { name, url } of scenarios) {
      const off = await visit(url, false);
      const on = await visit(url, true);
      const detects = off.internalHits > 0;
      const blocks = on.internalHits === 0;
      failed ||= !(detects && blocks);
      console.log(`[${name}]`);
      console.log(`   방어 끔: 내부 서버 접속 ${off.internalHits}회 ${detects ? "(검증이 유효함)" : "(⚠ 방어 없이도 접속이 없어 검증 무효)"}`);
      console.log(`   방어 켬: 내부 서버 접속 ${on.internalHits}회 ${blocks ? "→ 차단됨" : "→ ⚠ 뚫림"}`);
    }
    const control = await visit("http://a.test/to-public", true);
    const controlOk = control.finalText.includes("PUBLIC-OK");
    failed ||= !controlOk;
    console.log(`[대조: 공개 주소로 리다이렉트]\n   방어 켬: 최종 본문 "${control.finalText.trim()}" ${controlOk ? "→ 정상 통과" : "→ ⚠ 정상 리다이렉트까지 막힘"}`);
  } finally {
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

void main();
