// 사용: node bench/score.mjs  — bench/labels.json(정답)과 bench/out/<설정>/*.json(모델 출력)을 비교
// 정답 기준은 labels.json의 _rules 참고. ambiguous 항목은 예측에 있어도 감점·가점이 없다
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BENCH_DIR, CONFIGS, listJds } from "./common.mjs";
import { KEYWORD_DICTIONARY } from "../lib/keyword-dictionary.ts";
import { ZERO, f1, makeToSet, postingCounts, sumCounts, yearsMin } from "./metrics.ts";

const allLabels = JSON.parse(readFileSync(path.join(BENCH_DIR, "labels.json"), "utf8"));
const labels = Object.fromEntries(Object.entries(allLabels).filter(([id]) => !id.startsWith("_")));
const index = JSON.parse(readFileSync(path.join(BENCH_DIR, "jds", "index.json"), "utf8"));
const langOf = new Map(index.map((x) => [x.id, x.lang]));
const jdTexts = new Map(listJds().map((jd) => [jd.id, jd.text]));

const toSet = makeToSet(KEYWORD_DICTIONARY);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

function scoreConfig(config, ids) {
  let pooled = ZERO;
  let classified = ZERO;
  let n = 0;
  let schemaFailures = 0;
  let methodCorrect = 0;
  let yearsCorrect = 0;
  let invented = 0;
  let predictedTotal = 0;
  let yearsViolations = 0;
  let yearsNonEmpty = 0;
  let latencySum = 0;
  let tokensSum = 0;

  for (const id of ids) {
    const gold = labels[id];
    const file = path.join(BENCH_DIR, "out", config.name, `${id}.json`);
    if (!gold || !existsSync(file)) continue;
    const record = JSON.parse(readFileSync(file, "utf8"));
    n++;
    latencySum += record.latency_ms ?? 0;
    tokensSum += record.completion_tokens ?? 0;
    const posting = postingCounts(record.parsed, gold, toSet);
    pooled = sumCounts(pooled, posting.pooled);
    classified = sumCounts(classified, posting.classified);
    if (!record.parsed) {
      schemaFailures++;
      continue;
    }
    const p = record.parsed;

    if (p.submission_method === gold.submission_method) methodCorrect++;
    if (yearsMin(p.required_years) === gold.required_years_min) yearsCorrect++;

    // 정답 없이도 판정되는 규칙 위반: 공고 본문에 없는 스택, 원문에 없는 연차 문구
    const text = (jdTexts.get(id) ?? "").toLowerCase();
    for (const stack of [...p.required_stacks, ...p.preferred_stacks]) {
      predictedTotal++;
      if (!text.includes(stack.trim().toLowerCase())) invented++;
    }
    if (p.required_years.trim() !== "") {
      yearsNonEmpty++;
      if (!text.includes(p.required_years.trim().toLowerCase())) yearsViolations++;
    }
  }
  if (n === 0) return null;
  const a = f1(pooled);
  const b = f1(classified);
  return {
    구성: config.name,
    공고수: n,
    "스택 F1": pct(a.f1),
    정밀도: pct(a.precision),
    재현율: pct(a.recall),
    "분류까지 F1": pct(b.f1),
    "연차 정답률": pct(yearsCorrect / n),
    "지원방법 정답률": pct(methodCorrect / n),
    "스키마 실패": schemaFailures,
    "공고에 없는 스택": `${invented}/${predictedTotal}`,
    "연차 원문 위반": `${yearsViolations}/${yearsNonEmpty}`,
    "평균 지연(ms)": Math.round(latencySum / n),
    "평균 출력토큰": Math.round(tokensSum / n),
  };
}

const ids = Object.keys(labels);
const report = {};
for (const [title, subset] of [
  ["전체", ids],
  ["영문", ids.filter((id) => langOf.get(id) === "en")],
  ["한글", ids.filter((id) => langOf.get(id) === "ko")],
]) {
  const rows = CONFIGS.map((c) => scoreConfig(c, subset)).filter(Boolean);
  report[title] = rows;
  console.log(`\n=== ${title} ===`);
  console.table(rows);
}
writeFileSync(path.join(BENCH_DIR, "out", "report.json"), JSON.stringify(report, null, 2));
