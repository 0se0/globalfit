// 사용: node bench/compare.mjs <설정A> <설정B> [<설정C> <설정D> ...]   (두 개씩 짝지어 A − B를 계산한다)
// 같은 공고 묶음을 복원추출(5000회)해 두 설정의 F1 차이와 95% 구간을 구한다. 구간이 0을 포함하면
// 이 공고 30건으로는 두 설정을 구분할 수 없다는 뜻이다. 시드를 고정해서 같은 입력이면 같은 결과가 나온다
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BENCH_DIR } from "./common.mjs";
import { KEYWORD_DICTIONARY } from "../lib/keyword-dictionary.ts";
import { ZERO, f1, makeToSet, postingCounts, sumCounts } from "./metrics.ts";

const RESAMPLES = 5000;
const toSet = makeToSet(KEYWORD_DICTIONARY);
const allLabels = JSON.parse(readFileSync(path.join(BENCH_DIR, "labels.json"), "utf8"));
const labels = Object.fromEntries(Object.entries(allLabels).filter(([id]) => !id.startsWith("_")));
const ids = Object.keys(labels);

function loadCounts(config) {
  const byId = {};
  for (const id of ids) {
    const file = path.join(BENCH_DIR, "out", config, `${id}.json`);
    if (!existsSync(file)) throw new Error(`${config}: ${id}.json 없음 — extract.mjs를 먼저 실행하세요`);
    byId[id] = postingCounts(JSON.parse(readFileSync(file, "utf8")).parsed, labels[id], toSet);
  }
  return byId;
}

// 선형 합동 생성기 — 외부 의존 없이 재현 가능한 난수가 필요해서 고정 시드로 쓴다
let seed = 20261118;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

const stackF1 = (rows) => f1(rows.reduce((total, row) => sumCounts(total, row.pooled), ZERO)).f1;
const classifiedF1 = (rows) => f1(rows.reduce((total, row) => sumCounts(total, row.classified), ZERO)).f1;

function interval(a, b, metric) {
  const diffs = [];
  for (let i = 0; i < RESAMPLES; i++) {
    const sample = Array.from({ length: ids.length }, () => ids[Math.floor(random() * ids.length)]);
    diffs.push(metric(sample.map((id) => a[id])) - metric(sample.map((id) => b[id])));
  }
  diffs.sort((x, y) => x - y);
  const point = metric(ids.map((id) => a[id])) - metric(ids.map((id) => b[id]));
  const fmt = (x) => (x * 100).toFixed(1);
  return `${fmt(point)}%p  95% 구간 [${fmt(diffs[Math.floor(RESAMPLES * 0.025)])}, ${fmt(diffs[Math.ceil(RESAMPLES * 0.975) - 1])}]`;
}

const names = process.argv.slice(2);
if (names.length < 2 || names.length % 2 !== 0) {
  console.error("설정 이름을 두 개씩 넘기세요. 예: node bench/compare.mjs gemma3-12b-q4 llama3.1-8b-q4");
  process.exit(1);
}
for (let i = 0; i < names.length; i += 2) {
  const [nameA, nameB] = [names[i], names[i + 1]];
  const [a, b] = [loadCounts(nameA), loadCounts(nameB)];
  console.log(`${nameA} − ${nameB}`);
  console.log(`   스택 F1:     ${interval(a, b, stackF1)}`);
  console.log(`   분류까지 F1: ${interval(a, b, classifiedF1)}`);
}
