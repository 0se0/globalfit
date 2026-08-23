import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium은 바이너리 파일(bin/)을 실행 시점에 경로로 찾는데,
  // 번들러가 이 패키지를 추적/이동시키면 그 폴더가 배포 결과물에서 빠짐 —
  // 번들링 대상에서 제외해 node_modules 구조 그대로 포함되게 함
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // serverExternalPackages만으로는 Turbopack의 자동 파일 추적이 bin/ 폴더를
  // 못 찾아서, 해당 라우트에 명시적으로 포함시켜야 함
  outputFileTracingIncludes: {
    "/api/fetch-job/route": ["node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
