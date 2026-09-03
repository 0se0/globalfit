import { cosineSimilarity } from "./canonicalize-stacks";

// 스택명 동의어 판정(canonicalize-stacks)은 표기가 다른 "같은 것"을 찾는
// 문제라 0.8처럼 높은 임계값이 맞지만, 여긴 "관심 직군·연차"와 "React" 같은
// 서로 다른 종류의 텍스트 사이 의미적 관련성을 재는 문제라 임계값의 성격이
// 다르다. 실제 온보딩 신호가 쌓이기 전까지는 잠정치이며, 슬라이스 4(온보딩
// 위저드)에서 실데이터로 보정 예정
const SIMILARITY_THRESHOLD = 0.5;

export type SignalType = "stack" | "role_hint" | "company_size_hint";
export type SignalStrength = "strong" | "weak";

export interface DeclaredProfile {
  roles: string[];
  yearsOfExperience: string;
  workStyle?: string;
}

export interface RawSignal {
  type: SignalType;
  value: string;
  strength: SignalStrength;
}

export interface SignalWithVector extends RawSignal {
  vector: number[];
}

export interface DistilledSignal {
  type: SignalType;
  value: string;
  confidence: "confirmed" | "weak";
}

export interface DiscardedSignal {
  type: SignalType;
  value: string;
}

export interface DistilledProfile {
  summary: string;
  kept: DistilledSignal[];
  discarded: DiscardedSignal[];
}

function buildSummary(declared: DeclaredProfile, kept: DistilledSignal[]): string {
  const parts: string[] = [];

  const confirmedStacks = kept
    .filter((s) => s.type === "stack" && s.confidence === "confirmed")
    .map((s) => s.value);
  if (confirmedStacks.length > 0) {
    parts.push(`${confirmedStacks.slice(0, 3).join("·")} 중심`);
  }

  if (declared.roles.length > 0) {
    const roleLabel = declared.yearsOfExperience
      ? `${declared.roles[0]} ${declared.yearsOfExperience}`
      : declared.roles[0];
    parts.push(roleLabel);
  }

  if (declared.workStyle) parts.push(`${declared.workStyle} 선호`);

  const companySizeHint = kept.find(
    (s) => s.type === "company_size_hint" && s.confidence === "confirmed"
  );
  if (companySizeHint) parts.push(`${companySizeHint.value} 성향`);

  return parts.length > 0 ? parts.join(" · ") : "아직 프로필 신호가 충분하지 않습니다";
}

// LLM 판단 없이 순수 계산만 함 — declaredVector/signal.vector는 호출부(API
// 라우트)가 임베딩을 미리 구해서 넘겨준다. "관심 없다" 등 약한 반응에서 나온
// 신호만 유사도 미달 시 버리고, 강한 반응(익숙함·관심있음)은 유사도가 낮아도
// 버리지 않고 "약함"으로만 표시한다 (상충 신호를 함부로 지우지 않기 위함)
export function distillProfile(
  declared: DeclaredProfile,
  declaredVector: number[],
  signals: SignalWithVector[]
): DistilledProfile {
  const kept: DistilledSignal[] = [];
  const discarded: DiscardedSignal[] = [];

  for (const signal of signals) {
    const similarity = cosineSimilarity(declaredVector, signal.vector);
    const relevant = similarity >= SIMILARITY_THRESHOLD;

    if (!relevant && signal.strength === "weak") {
      discarded.push({ type: signal.type, value: signal.value });
      continue;
    }

    kept.push({
      type: signal.type,
      value: signal.value,
      confidence: relevant ? "confirmed" : "weak",
    });
  }

  return { summary: buildSummary(declared, kept), kept, discarded };
}
