import type { CanonicalizedStack } from "./canonicalize-stacks";

// 기업분석의 "최근 채용공고 요구 스택"을 JD의 preferred_stacks에 합친다 (2026-08-29
// 결정, CLAUDE.md 참고) — canonical 기준으로 중복 제거. required_stacks는 손대지
// 않고, 기업분석을 안 했으면 JD의 preferred_stacks만 그대로 반환한다
export function mergeCompanyStacksIntoPreferred(
  jdPreferred: CanonicalizedStack[],
  companyAggregatedStacks: CanonicalizedStack[] | undefined
): CanonicalizedStack[] {
  if (!companyAggregatedStacks || companyAggregatedStacks.length === 0) return jdPreferred;
  const seen = new Set(jdPreferred.map((s) => (s.canonical ?? s.raw).toLowerCase()));
  const merged = [...jdPreferred];
  for (const stack of companyAggregatedStacks) {
    const key = (stack.canonical ?? stack.raw).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(stack);
    }
  }
  return merged;
}
