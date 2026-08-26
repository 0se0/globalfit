import type { ParsedJob } from "@/app/api/parse-job/route";

// 판단 지점 에이전트(judge-job)는 그 자체로 최소 1회의 generateContent 호출을
// 쓴다(도구를 하나도 안 써도 "확인할 거 없음" 판단에 1회는 필요). 무료 티어
// 일일 호출 한도(20회/일)를 아끼기 위해, 실제로 뭔가 애매하거나 미등록 스택이
// 있을 때만 에이전트를 부르고 그렇지 않으면 순수 코드 로직으로 스킵한다.
// 이 필터는 "애매함을 판단"하지 않는다 — 그건 여전히 에이전트(LLM)의 몫이고,
// 이 필터는 단지 "부를 가치가 있어 보이는가"만 코드로 싸게 거른다
const AMBIGUITY_SIGNAL_PATTERNS: RegExp[] = [
  /우대/,
  /선호/,
  /가산점/,
  /있으면\s*좋/,
  /nice[\s-]?to[\s-]?have/i,
  /\bpreferred\b/i,
  /\ba\s+plus\b/i,
  /\bbonus\b/i,
  /\bwelcome\b/i,
  /\bideally\b/i,
  /familiarity with/i,
  /exposure to/i,
  /some experience/i,
];

export function shouldRunJudgeAgent(jdText: string, parsedJob: ParsedJob): boolean {
  const allStacks = [...parsedJob.required_stacks, ...parsedJob.preferred_stacks];
  if (allStacks.some((stack) => !stack.registered)) return true;
  return AMBIGUITY_SIGNAL_PATTERNS.some((pattern) => pattern.test(jdText));
}
