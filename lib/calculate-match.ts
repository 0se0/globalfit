import type { CanonicalizedStack } from "./canonicalize-stacks";

// 필수 스택 3배 가중치 — 지원자격에 직접 영향을 주기 때문
const REQUIRED_WEIGHT = 3;
const PREFERRED_WEIGHT = 1;
const MAX_GAP_STACKS = 3;

export interface Deduction {
  raw: string;
  category: "required" | "preferred";
  points: number;
}

export interface MatchResult {
  score: number;
  gap_stacks: string[];
  deductions: Deduction[];
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

  // 스택 하나가 빠지면 100점 만점에서 몇 점이 깎이는지 — required/preferred는
  // 가중치가 다르므로(3배) 카테고리별로 스택 1개당 감점 폭도 다르다
  const perRequiredPoint =
    requiredStacks.length > 0 && weightTotal > 0
      ? (REQUIRED_WEIGHT / requiredStacks.length / weightTotal) * 100
      : 0;
  const perPreferredPoint =
    preferredStacks.length > 0 && weightTotal > 0
      ? (PREFERRED_WEIGHT / preferredStacks.length / weightTotal) * 100
      : 0;

  // required와 preferred 양쪽에 같은 스택이 들어있을 수 있음 (기업분석
  // aggregated_stacks가 JD의 required_stacks와 겹치는 항목을 preferred에 추가하는
  // 경우가 대표적 — merge-company-stacks.ts는 의도적으로 required_stacks를 모르는
  // 채 동작함). 그대로 두면 같은 스택명이 감점 내역에 두 번 들어가 화면에서
  // React key 중복 경고가 남고 감점도 이중으로 잡히므로, canonical(없으면 raw)
  // 기준으로 중복 제거하고 먼저 나온 쪽(required 우선)의 분류를 따른다
  const seenKeys = new Set<string>();
  const deductions: Deduction[] = [];
  for (const stack of [...missingRequired, ...missingPreferred]) {
    const key = normalize(stack.canonical ?? stack.raw);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const isRequired = missingRequired.some(
      (s) => normalize(s.canonical ?? s.raw) === key
    );
    deductions.push({
      raw: stack.raw,
      category: isRequired ? "required" : "preferred",
      points: Math.round(isRequired ? perRequiredPoint : perPreferredPoint),
    });
  }

  const gap_stacks = deductions.slice(0, MAX_GAP_STACKS).map((d) => d.raw);

  return { score, gap_stacks, deductions };
}
