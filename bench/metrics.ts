// 채점에 쓰는 순수 함수 모음 — score.mjs와 compare.mjs가 같은 계산을 쓰도록 한곳에 둔다.
// 사전(DictionaryEntry[])을 인자로 받는 이유: 테스트가 실제 키워드 사전에 묶이지 않게 하려는 것

export type DictionaryEntry = { canonical: string; synonyms: readonly string[] };
export type Counts = { truePositive: number; predictedSize: number; goldSize: number };
export type GoldLabels = { required: string[]; preferred: string[]; ambiguous: string[] };
export type ParsedStacks = { required_stacks: string[]; preferred_stacks: string[] };
export type ToSet = (list: string[]) => Set<string>;

export const ZERO: Counts = { truePositive: 0, predictedSize: 0, goldSize: 0 };

// 임베딩 없이 사전의 정확 일치(표준명+동의어)만으로 표기를 통일한다 — React.js 와 React 를 같은 스택으로 본다
export function makeToSet(entries: readonly DictionaryEntry[]): ToSet {
  const canonicalIndex = new Map<string, string>();
  for (const entry of entries) {
    canonicalIndex.set(entry.canonical.toLowerCase(), entry.canonical.toLowerCase());
    for (const synonym of entry.synonyms) canonicalIndex.set(synonym.toLowerCase(), entry.canonical.toLowerCase());
  }
  const normalize = (name: string): string => {
    const key = name.trim().toLowerCase();
    return canonicalIndex.get(key) ?? key;
  };
  return (list) => new Set(list.map(normalize));
}

export function minus(set: Set<string>, neutral: Set<string>): Set<string> {
  return new Set([...set].filter((item) => !neutral.has(item)));
}

export function counts(predicted: Set<string>, gold: Set<string>): Counts {
  let truePositive = 0;
  for (const item of predicted) if (gold.has(item)) truePositive++;
  return { truePositive, predictedSize: predicted.size, goldSize: gold.size };
}

export function sumCounts(a: Counts, b: Counts): Counts {
  return {
    truePositive: a.truePositive + b.truePositive,
    predictedSize: a.predictedSize + b.predictedSize,
    goldSize: a.goldSize + b.goldSize,
  };
}

export function f1(total: Counts): { precision: number; recall: number; f1: number } {
  const precision = total.predictedSize === 0 ? (total.goldSize === 0 ? 1 : 0) : total.truePositive / total.predictedSize;
  const recall = total.goldSize === 0 ? 1 : total.truePositive / total.goldSize;
  const score = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1: score };
}

// 모델이 적은 연차 문구에서 첫 숫자를 최소 연차로 본다 ("3+ years"=3, "2-5 years"=2, "신입"=없음)
export function yearsMin(text: unknown): number | null {
  const match = String(text ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

// 공고 한 건의 채점 재료. pooled는 필수·우대를 합쳐 본 것, classified는 필수는 필수끼리·우대는 우대끼리만 맞는 것으로 센다.
// 스키마 실패(parsed가 null)는 아무것도 못 찾은 것으로 센다 — 어려운 공고를 빼서 점수를 부풀리지 않기 위해.
// ambiguous 항목은 예측에 있어도 정답 집합에 없어도 점수에 영향이 없다
export function postingCounts(
  parsed: ParsedStacks | null,
  gold: GoldLabels,
  toSet: ToSet
): { pooled: Counts; classified: Counts } {
  const neutral = toSet(gold.ambiguous);
  const goldRequired = toSet(gold.required);
  const goldPreferred = toSet(gold.preferred);
  const goldAll = new Set([...goldRequired, ...goldPreferred]);
  const predRequired = parsed ? minus(toSet(parsed.required_stacks), neutral) : new Set<string>();
  const predPreferred = parsed ? minus(toSet(parsed.preferred_stacks), neutral) : new Set<string>();
  const predAll = new Set([...predRequired, ...predPreferred]);
  return {
    pooled: counts(predAll, goldAll),
    classified: sumCounts(counts(predRequired, goldRequired), counts(predPreferred, goldPreferred)),
  };
}
