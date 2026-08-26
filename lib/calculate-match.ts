import type { CanonicalizedStack } from "./canonicalize-stacks";

// 필수 스택 3배 가중치 — 지원자격에 직접 영향을 주기 때문
const REQUIRED_WEIGHT = 3;
const PREFERRED_WEIGHT = 1;
const MAX_GAP_STACKS = 3;

export interface MatchResult {
  score: number;
  gap_stacks: string[];
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function stacksMatch(a: CanonicalizedStack, b: CanonicalizedStack): boolean {
  if (a.registered && b.registered && a.canonical && b.canonical) {
    return normalize(a.canonical) === normalize(b.canonical);
  }
  // 둘 중 하나라도 사전에 없으면 canonical로 판단할 근거가 없으므로,
  // 원문 문자열이 완전히 같을 때만 매칭으로 본다 (임의 추측 금지)
  return normalize(a.raw) === normalize(b.raw);
}

function isPresentIn(stack: CanonicalizedStack, pool: CanonicalizedStack[]): boolean {
  return pool.some((candidate) => stacksMatch(stack, candidate));
}

// 매칭 퍼센티지·gap 스택 계산은 항상 이 함수 하나로만 한다 (LLM 아님, 순수
// 함수) — 원본/개선후/잠재최대 점수 모두 이 함수를 재사용해 일관성을 유지한다
export function calculateMatch(
  requiredStacks: CanonicalizedStack[],
  preferredStacks: CanonicalizedStack[],
  applicantStacks: CanonicalizedStack[]
): MatchResult {
  const missingRequired = requiredStacks.filter(
    (stack) => !isPresentIn(stack, applicantStacks)
  );
  const missingPreferred = preferredStacks.filter(
    (stack) => !isPresentIn(stack, applicantStacks)
  );

  const matchedRequired = requiredStacks.length - missingRequired.length;
  const matchedPreferred = preferredStacks.length - missingPreferred.length;

  let weightedSum = 0;
  let weightTotal = 0;
  if (requiredStacks.length > 0) {
    weightedSum += (matchedRequired / requiredStacks.length) * REQUIRED_WEIGHT;
    weightTotal += REQUIRED_WEIGHT;
  }
  if (preferredStacks.length > 0) {
    weightedSum += (matchedPreferred / preferredStacks.length) * PREFERRED_WEIGHT;
    weightTotal += PREFERRED_WEIGHT;
  }

  const score = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : 0;

  const gap_stacks = [...missingRequired, ...missingPreferred]
    .slice(0, MAX_GAP_STACKS)
    .map((stack) => stack.raw);

  return { score, gap_stacks };
}
