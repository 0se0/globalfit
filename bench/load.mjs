// 사용: node bench/load.mjs [설정이름 ...]  — 동시 요청 수(1/2/4/8)별 지연·처리량 측정
// 총 8건을 N개씩 동시에 보내 같은 작업량을 다른 동시성으로 비교한다
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BENCH_DIR, CONFIGS, buildPrompt, callOllama, listJds } from "./common.mjs";

const TOTAL_REQUESTS = 8;
const LEVELS = [1, 2, 4, 8];

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

const wanted = process.argv.slice(2);
const configs = CONFIGS.filter((c) => c.kind === "ollama" && (wanted.length === 0 || wanted.includes(c.name)));
const jds = listJds();
// 프롬프트 앞에 요청마다 다른 문구를 붙여 Ollama의 프롬프트 캐시를 막는다 — 같은 프롬프트를 레벨마다 반복하면 뒤 레벨만 캐시 덕에 빨라져 동시성 비교가 왜곡된다
let nonce = 0;
const makePrompt = (i) => `[req-${++nonce}-${Date.now()}]\n${buildPrompt(jds[i % jds.length].text)}`;
const rows = [];

for (const config of configs) {
  // 첫 요청이 모델 로딩 시간을 먹지 않도록 워밍업
  await callOllama(config.model, makePrompt(0));
  for (const level of LEVELS) {
    const latencies = [];
    let completionTokens = 0;
    const started = performance.now();
    for (let offset = 0; offset < TOTAL_REQUESTS; offset += level) {
      const wave = Array.from({ length: Math.min(level, TOTAL_REQUESTS - offset) }, (_, k) => makePrompt(offset + k));
      const results = await Promise.all(wave.map((p) => callOllama(config.model, p)));
      for (const r of results) {
        latencies.push(r.latency_ms);
        completionTokens += r.completion_tokens;
      }
    }
    const wallSeconds = (performance.now() - started) / 1000;
    latencies.sort((a, b) => a - b);
    const row = {
      config: config.name,
      concurrency: level,
      p50_ms: percentile(latencies, 0.5),
      p95_ms: percentile(latencies, 0.95),
      wall_s: Number(wallSeconds.toFixed(1)),
      aggregate_tok_per_s: Number((completionTokens / wallSeconds).toFixed(1)),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

mkdirSync(path.join(BENCH_DIR, "out"), { recursive: true });
writeFileSync(path.join(BENCH_DIR, "out", "load.json"), JSON.stringify(rows, null, 2));
