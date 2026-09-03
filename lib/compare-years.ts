export type YearsMatchStatus = "meets" | "below" | "unclear";

export interface YearsComparisonResult {
  status: YearsMatchStatus;
  requiredMinYears: number | null;
  applicantYears: number | null;
}

// LLM이 뽑은 자유 텍스트(예: "3년 이상", "2-5 years", "신입")에서 숫자를
// 못 찾으면 추측하지 않고 "확인 불가"로 남긴다 (암묵지 7번과 같은 원칙).
// calculateMatch(하드 룰 4)와는 완전히 별도 경로 — 매칭 퍼센티지는 여전히
// 스택만으로 계산하고, 이건 점수 옆에 보여주는 부가 신호일 뿐이다
function extractMinYears(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/신입|entry[\s-]?level/i.test(trimmed)) return 0;
  const match = trimmed.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function compareExperienceYears(
  requiredYearsText: string,
  applicantYearsText: string
): YearsComparisonResult {
  const requiredMinYears = extractMinYears(requiredYearsText);
  const applicantYears = extractMinYears(applicantYearsText);

  if (requiredMinYears === null || applicantYears === null) {
    return { status: "unclear", requiredMinYears, applicantYears };
  }

  return {
    status: applicantYears >= requiredMinYears ? "meets" : "below",
    requiredMinYears,
    applicantYears,
  };
}
