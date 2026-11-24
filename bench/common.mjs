import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(BENCH_DIR, "..");
export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

export const CONFIGS = [
  { name: "gemini", kind: "gemini" },
  { name: "llama3.1-8b-q4", kind: "ollama", model: "llama3.1:8b" },
  { name: "gemma3-12b-q4", kind: "ollama", model: "gemma3:12b" },
  { name: "llama3.2-3b-q4", kind: "ollama", model: "llama3.2:3b" },
  { name: "llama3.2-3b-q4-noex", kind: "ollama", model: "llama3.2:3b", promptVariant: "noexample" },
  { name: "llama3.1-8b-q4-noex", kind: "ollama", model: "llama3.1:8b", promptVariant: "noexample" },
  { name: "gemma3-12b-q4-noex", kind: "ollama", model: "gemma3:12b", promptVariant: "noexample" },
];

// 운영 라우트의 프롬프트·모델명을 그대로 읽어 쓴다 — 비교 조건이 운영과 어긋나지 않게
const routeSource = readFileSync(path.join(ROOT, "app/api/parse-job/route.ts"), "utf8");
export const PROMPT_TEMPLATE = routeSource.split("const PROMPT = `")[1].split("`;")[0];
export const GEMINI_MODEL = routeSource.match(/GEMINI_MODEL = "([^"]+)"/)[1];

// noexample 변형: 모델이 그대로 복사할 수 있는 구체적 예시 값 두 곳(스택 "React", 연차 "3년 이상" 등)만 뺀다
const EXAMPLE_VALUES = [' (e.g. "React", not "리액트")', ' (e.g. "3년 이상", "2-5 years", "신입")'];

export function buildPrompt(jdText, variant) {
  let template = PROMPT_TEMPLATE;
  if (variant === "noexample") {
    for (const example of EXAMPLE_VALUES) {
      if (!template.includes(example)) throw new Error(`프롬프트에서 예시를 찾지 못함: ${example}`);
      template = template.replace(example, "");
    }
  }
  return template.replace("{{JD_TEXT}}", jdText);
}

export const JSON_SCHEMA = {
  type: "object",
  properties: {
    required_stacks: { type: "array", items: { type: "string" } },
    preferred_stacks: { type: "array", items: { type: "string" } },
    submission_method: {
      type: "string",
      enum: ["company_site", "job_platform", "email", "unclear"],
    },
    required_documents: { type: "array", items: { type: "string" } },
    required_years: { type: "string" },
  },
  required: [
    "required_stacks",
    "preferred_stacks",
    "submission_method",
    "required_documents",
    "required_years",
  ],
};

export function listJds() {
  return readdirSync(path.join(BENCH_DIR, "jds"))
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: f.replace(/\.txt$/, ""),
      text: readFileSync(path.join(BENCH_DIR, "jds", f), "utf8"),
    }));
}

export async function callOllama(model, prompt) {
  const started = performance.now();
  const response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      // 모델이 JSON을 끝내지 못하고 반복 생성하면 5분 넘게 멈추므로 상한을 둔다 — 상한에서 잘린 출력은 스키마 실패로 센다
      max_tokens: 1024,
      response_format: {
        type: "json_schema",
        json_schema: { name: "job", schema: JSON_SCHEMA, strict: true },
      },
    }),
  });
  if (!response.ok) throw new Error(`ollama ${response.status}: ${await response.text()}`);
  const body = await response.json();
  return {
    latency_ms: Math.round(performance.now() - started),
    prompt_tokens: body.usage?.prompt_tokens ?? 0,
    completion_tokens: body.usage?.completion_tokens ?? 0,
    raw: body.choices[0].message.content,
  };
}
