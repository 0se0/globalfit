// 사용: node bench/example-copies.mjs <설정> [<설정> ...]
// 운영 프롬프트의 예시 값("React", "3년 이상", "2-5 years")이 공고에 없는데 모델 출력에 나온 공고 수를 센다.
// 작은 모델이 예시를 그대로 복사하는지 보려는 것이며, 정답지는 쓰지 않고 공고 본문과만 대조한다
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BENCH_DIR, listJds } from "./common.mjs";
import { KEYWORD_DICTIONARY } from "../lib/keyword-dictionary.ts";
import { makeToSet } from "./metrics.ts";

const toSet = makeToSet(KEYWORD_DICTIONARY);
const jds = listJds();
const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("설정 이름을 넘기세요. 예: node bench/example-copies.mjs llama3.2-3b-q4 llama3.2-3b-q4-noex");
  process.exit(1);
}

for (const name of names) {
  const found = { React: 0, "3년 이상": 0, "2-5 years": 0 };
  let n = 0;
  for (const jd of jds) {
    const file = path.join(BENCH_DIR, "out", name, `${jd.id}.json`);
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, "utf8")).parsed;
    if (!parsed) continue;
    n++;
    const stacks = toSet([...parsed.required_stacks, ...parsed.preferred_stacks]);
    if (stacks.has("react") && !/\breact\b/i.test(jd.text)) found.React++;
    if (/3년 이상/.test(parsed.required_years) && !jd.text.includes("3년 이상")) found["3년 이상"]++;
    if (/2\s*-\s*5\s*years/i.test(parsed.required_years) && !/2\s*-\s*5\s*years/i.test(jd.text)) found["2-5 years"]++;
  }
  console.log(`${name.padEnd(22)} (공고 ${n}건 중 본문에 없는데 출력한 건수)`, JSON.stringify(found));
}
