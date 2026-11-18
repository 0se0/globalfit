import type { Page } from "puppeteer-core";
import { isRequestAllowed, type HostResolver } from "./safe-url";

// 첫 주소만 검사하면 공개 사이트가 내부 주소로 리다이렉트하거나 하위 리소스로 내부 주소를 부르는
// 우회를 못 막는다 — 브라우저가 보내는 모든 요청(리다이렉트 포함)에 같은 검사를 적용한다
export async function guardBrowserRequests(page: Page, resolve?: HostResolver): Promise<void> {
  await page.setRequestInterception(true);
  const verdicts = new Map<string, Promise<boolean>>();
  page.on("request", (req) => {
    void (async () => {
      try {
        if (["image", "font", "media"].includes(req.resourceType())) {
          await req.abort();
        } else if (await isRequestAllowed(req.url(), verdicts, resolve)) {
          await req.continue();
        } else {
          await req.abort("blockedbyclient");
        }
      } catch {
        // 이미 처리된 요청이거나 페이지가 닫힌 경우
      }
    })();
  });
}
