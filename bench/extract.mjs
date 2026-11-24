// 사용: node --env-file=.env.local bench/extract.mjs [설정이름 ...]
// 이미 결과가 있는 (설정, 공고) 조합은 건너뛴다 — Gemini 무료 한도(하루 20회)를 아끼기 위해
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import { BENCH_DIR, CONFIGS, GEMINI_MODEL, JSON_SCHEMA, buildPrompt, callOllama, listJds } from "./common.mjs";

const GEMINI_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    required_stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
    preferred_stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
    submission_method: { type: Type.STRING, enum: JSON_SCHEMA.properties.submission_method.enum },
    required_documents: { type: Type.ARRAY, items: { type: Type.STRING } },
    required_years: { type: Type.STRING },
  },
  required: JSON_SCHEMA.required,
};

// 503(수요 폭주)은 일시 오류라 간격을 두고 재시도한다. 지연 시간은 성공한 호출 한 번의 값만 잰다
async function callGemini(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA },
      });
      return toRecord(response, performance.now() - started);
    } catch (error) {
      if (attempt >= 3 || !/503|UNAVAILABLE/i.test(String(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000 * 2 ** attempt));
    }
  }
}

function toRecord(response, elapsedMs) {
  return {
    latency_ms: Math.round(elapsedMs),
    prompt_tokens: response.usageMetadata?.promptTokenCount ?? 0,
    completion_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    raw: response.text ?? "",
  };
}

const wanted = process.argv.slice(2);
const configs = CONFIGS.filter((c) => wanted.length === 0 || wanted.includes(c.name));
const jds = listJds();

for (const config of configs) {
  const outDir = path.join(BENCH_DIR, "out", config.name);
  mkdirSync(outDir, { recursive: true });
  for (const jd of jds) {
    const outFile = path.join(outDir, `${jd.id}.json`);
    if (existsSync(outFile)) continue;
    const prompt = buildPrompt(jd.text, config.promptVariant);
    let record;
    try {
      const result = config.kind === "gemini" ? await callGemini(prompt) : await callOllama(config.model, prompt);
      let parsed = null;
      try {
        parsed = JSON.parse(result.raw);
      } catch {
        parsed = null;
      }
      record = { config: config.name, jd: jd.id, ...result, parsed };
    } catch (error) {
      // 호출 자체의 실패(한도 초과·연결 오류)는 모델 출력이 아니므로 저장하지 않고, 다음 실행에서 재시도한다
      console.log(config.name, jd.id, `ERROR ${String(error).slice(0, 100)}`);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(error))) break;
      continue;
    }
    writeFileSync(outFile, JSON.stringify(record, null, 2));
    console.log(config.name, jd.id, `${record.latency_ms}ms${record.parsed ? "" : " (JSON 파싱 실패)"}`);
  }
}
