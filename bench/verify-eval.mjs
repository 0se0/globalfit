// 사용: node bench/verify-eval.mjs  — 저장된 모델 출력에 지원방법 검증기를 적용해 추측률 전/후를 잰다
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BENCH_DIR, CONFIGS, listJds } from "./common.mjs";
import { verifySubmissionMethod } from "../lib/verify-submission-method.ts";

const jds = new Map(listJds().map((jd) => [jd.id, jd.text]));
const rows = [];
for (const config of CONFIGS) {
  let n = 0, before = 0, after = 0;
  for (const [id, text] of jds) {
    const file = path.join(BENCH_DIR, "out", config.name, `${id}.json`);
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, "utf8")).parsed;
    if (!parsed) continue;
    n++;
    if (parsed.submission_method !== "unclear") before++;
    if (verifySubmissionMethod(text, parsed.submission_method) !== "unclear") after++;
  }
  if (n) rows.push({ 구성: config.name, 공고수: n, "추측(검증 전)": `${before}/${n}`, "추측(검증 후)": `${after}/${n}` });
}
console.table(rows);
