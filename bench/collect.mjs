// 사용: node bench/collect.mjs [--exclude <index.json> ...]  — Greenhouse 공개 API에서 개발 직군 공고 본문을 bench/jds/에 저장
// --exclude로 이전에 쓴 공고의 index.json을 주면 그 공고(board+job_id)는 건너뛰어 새 공고만 모은다
// 선정 규칙은 모델 성능과 무관하게 고정: 개발 직군 제목 → 본문 800자 이상 → API 목록 순서 → 회사당 상한
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BENCH_DIR } from "./common.mjs";

const SOURCES = [
  { lang: "en", boards: ["stripe", "airbnb", "figma", "databricks", "cloudflare", "datadog"], perCompany: 3, target: 15 },
  { lang: "ko", boards: ["daangn", "krafton", "coupang"], perCompany: 8, target: 15 },
];
const TITLE = /engineer|developer|개발|엔지니어|sre|devops|machine learning|backend|frontend|full.?stack|프론트|백엔드|android|ios|데이터 ?사이언/i;
// 개발 직군이 아닌 공고(영업·인사·사업개발·설비 등)는 스택 추출 대상이 아니므로 직군 기준으로만 제외한다
const EXCLUDE = /sales|customer|account|partner|recruit|people|director|manager|data ?center|advocate|사업개발|팀장|설비|물류|보전|영업|인사|인재|HRD|사무|건축|보조|디자인 시스템|network engineer/i;
const MIN_LENGTH = 800;

const excluded = new Set();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "--exclude") continue;
  const file = args[++i];
  if (!file || !existsSync(file)) throw new Error(`--exclude 파일이 없다: ${file}`);
  for (const item of JSON.parse(readFileSync(file, "utf8"))) excluded.add(`${item.board}:${item.job_id}`);
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
};
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

function htmlToText(html) {
  return decode(
    decode(html)
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hangulRatio(text) {
  const letters = text.match(/[A-Za-zㄱ-ㆎ가-힣]/g) ?? [];
  if (letters.length === 0) return 0;
  return letters.filter((c) => /[ㄱ-ㆎ가-힣]/.test(c)).length / letters.length;
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

async function collectBoard(board, lang, perCompany) {
  const { jobs } = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
  const picked = [];
  for (const job of jobs) {
    if (picked.length >= perCompany) break;
    if (!TITLE.test(job.title) || EXCLUDE.test(job.title)) continue;
    if (excluded.has(`${board}:${job.id}`)) continue;
    const detail = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${job.id}`);
    const body = htmlToText(detail.content ?? "");
    if (body.length < MIN_LENGTH) continue;
    const ratio = hangulRatio(body);
    if (lang === "ko" ? ratio < 0.3 : ratio > 0.01) continue;
    picked.push({ board, job_id: job.id, title: job.title, url: detail.absolute_url, lang, updated_at: detail.updated_at ?? job.updated_at ?? null, first_published: detail.first_published ?? null, text: `${job.title}\n\n${body}` });
  }
  return picked;
}

mkdirSync(path.join(BENCH_DIR, "jds"), { recursive: true });
const selected = [];
for (const source of SOURCES) {
  const perBoard = [];
  for (const board of source.boards) {
    const picked = await collectBoard(board, source.lang, source.perCompany);
    console.log(source.lang, board, picked.length);
    perBoard.push(picked);
  }
  // 회사별 목록을 번갈아 뽑아 특정 회사에 쏠리지 않게 한다
  const round = [];
  for (let i = 0; i < source.perCompany; i++) for (const list of perBoard) if (list[i]) round.push(list[i]);
  selected.push(...round.slice(0, source.target));
}

const index = selected.map((item, i) => {
  const id = String(i + 1).padStart(2, "0");
  writeFileSync(path.join(BENCH_DIR, "jds", `${id}.txt`), item.text);
  return { id, board: item.board, job_id: item.job_id, title: item.title, url: item.url, lang: item.lang, updated_at: item.updated_at, first_published: item.first_published, collected_at: new Date().toISOString().slice(0, 10), chars: item.text.length };
});
writeFileSync(path.join(BENCH_DIR, "jds", "index.json"), JSON.stringify(index, null, 2));
console.log(`saved ${index.length} JDs (en ${index.filter((x) => x.lang === "en").length}, ko ${index.filter((x) => x.lang === "ko").length})`);
