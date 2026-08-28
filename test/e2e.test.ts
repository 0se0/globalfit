import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalizedStack } from "@/lib/canonicalize-stacks";
import { calculateMatch } from "@/lib/calculate-match";

// LLM 경계(Gemini)를 모킹한다 — 오케스트레이션/Diff계산/에러처리 로직을
// 결정적으로 빠르게 검증하는 게 목적이며, 실제 Gemini 응답 품질(예: 영문 스택명
// 번역 안 함, 애매함 판단)은 이 테스트의 검증 대상이 아니다. 무료 티어 일일
// 호출 한도(20회)를 매 테스트 실행마다 소모하지 않기 위한 선택.
vi.mock("@google/genai", () => {
  class GoogleGenAI {
    models = {
      generateContent: vi.fn(async ({ contents }: { contents: string }) => {
        if (contents.includes("Nimbus Freight")) {
          return {
            text: JSON.stringify({
              required_stacks: ["React", "Node.js", "PostgreSQL"],
              preferred_stacks: ["Docker", "AWS"],
              submission_method: "company_site",
              required_documents: [],
            }),
          };
        }
        if (contents.includes("Anonymous Startup")) {
          return {
            text: JSON.stringify({
              required_stacks: ["Python"],
              preferred_stacks: ["Kubernetes"],
              submission_method: "unclear",
              required_documents: [],
            }),
          };
        }
        if (
          contents.includes(
            "You are parsing a resume/application document into structured JSON"
          )
        ) {
          return {
            text: JSON.stringify({
              // Node.js는 프로젝트 설명 안에만 짧게 언급되어 있어, 최초 파싱(05)은
              // 이를 최상위 stacks 목록으로 뽑아내지 못한 상황을 재현한다 —
              // 이후 11(재구성 제안)에서 confirmed_gap_stacks로 뒤늦게 확인됨
              stacks: ["React", "PostgreSQL"],
              projects: ["사내 물류 추적 시스템 리뉴얼 (React, PostgreSQL)"],
              years_of_experience: "2년",
              experience: ["ABC테크 백엔드 개발자 (2년)"],
            }),
          };
        }
        if (
          contents.includes(
            "You are helping rewrite a resume/application document, checking which candidate stacks"
          )
        ) {
          // 자소서/포트폴리오 텍스트가 프롬프트에 포함된 경우에만 각 suggestion을
          // 채운다 — 실제 라우트도 입력 없으면 빈 문자열을 반환하도록 설계됨
          const hasCoverLetter = contents.includes("귀사의 물류 자동화 서비스에");
          const hasPortfolio = contents.includes(
            "담당: 프론트엔드 UI 및 주문 데이터베이스 스키마 설계"
          );
          return {
            text: JSON.stringify({
              resume_suggestion:
                "홍길동\n\n경력\n- ABC테크 백엔드 개발자로 2년간 React 기반 대시보드와 PostgreSQL 주문 데이터베이스를 운영했으며, Node.js로 결제 배치 스크립트도 일부 작성했습니다.\n\n프로젝트\n- 사내 물류 추적 시스템을 React와 PostgreSQL로 리뉴얼했습니다.",
              cover_letter_suggestion: hasCoverLetter
                ? "ABC테크에서 2년간 백엔드 개발자로 근무하며 React 대시보드와 PostgreSQL 주문 데이터베이스를 함께 다뤄왔습니다. 물류 데이터를 실시간으로 추적하는 프로젝트 리뉴얼을 통해 사용자 경험과 데이터 정합성을 동시에 고려하는 역량을 길렀고, 이를 바탕으로 귀사의 물류 자동화 서비스에 기여하고 싶습니다."
                : "",
              portfolio_suggestion: hasPortfolio
                ? "1. 사내 물류 추적 시스템 리뉴얼 — React, PostgreSQL 기반 실시간 배송 현황 대시보드 개발, 프론트엔드 UI 및 주문 데이터베이스 스키마 설계 담당\n2. 결제 배치 처리 스크립트 — Node.js로 야간 배치 결제 정산 스크립트 작성 및 운영"
                : "",
              // Node.js는 원본 문서에 실제로 언급되어 있어 confirmed, Docker/AWS는
              // 원본 어디에도 없어 confirmed하지 않음 (개선 제안서 전용 항목이 됨)
              confirmed_gap_stacks: ["Node.js"],
              interview_questions: [
                "결제 배치 처리 스크립트에서 Node.js를 사용하며 겪었던 가장 어려웠던 동시성 문제는 무엇이었나요?",
                "PostgreSQL 주문 데이터베이스를 설계할 때 데이터 정합성을 어떻게 보장했나요?",
              ],
            }),
          };
        }
        throw new Error(`unexpected generateContent call: ${contents.slice(0, 200)}`);
      }),
      embedContent: vi.fn(async () => {
        // 이 테스트의 fixture 스택명은 전부 keyword-dictionary의 canonical
        // 표기와 정확히 일치해 exactMatchIndex에서 잡히므로, 임베딩 폴백
        // 경로(embedContent)는 호출되지 않아야 한다
        throw new Error("embedContent should not be called for exact-match stacks");
      }),
    };
  }

  return {
    GoogleGenAI,
    Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING" },
  };
});

const { POST: parseJob } = await import("@/app/api/parse-job/route");
const { POST: parseApplicant } = await import("@/app/api/parse-applicant/route");
const { POST: suggestResume } = await import("@/app/api/suggest-resume/route");

const FIXTURES_DIR = path.join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
}

async function callRoute<T>(
  handler: (request: Request) => Promise<Response>,
  body: unknown
): Promise<T> {
  const request = new Request("http://localhost/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await handler(request);
  if (!response.ok) {
    throw new Error(`route failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

interface ParsedJobResult {
  required_stacks: CanonicalizedStack[];
  preferred_stacks: CanonicalizedStack[];
  submission_method: "company_site" | "job_platform" | "email" | "unclear";
  required_documents: string[];
}

interface ParsedApplicantResult {
  stacks: CanonicalizedStack[];
  projects: string[];
  years_of_experience: string;
  experience: string[];
}

interface SuggestionResult {
  resume_suggestion: string;
  cover_letter_suggestion: string;
  portfolio_suggestion: string;
  confirmed_gap_stacks: string[];
  interview_questions: string[];
}

interface AnalysisResult {
  submission_method: string;
  required_documents: string[];
  original_score: number;
  improved_score: number;
  potential_score: number;
  gap_stacks: string[];
  improvement_suggestions: string[];
  resume_suggestion: string;
  cover_letter_suggestion: string;
  portfolio_suggestion: string;
}

// app/page.tsx의 오케스트레이션(parse-job → parse-applicant → calculateMatch →
// suggest-resume → improved/potential 재계산)을 그대로 재현한다. 새 프로덕션
// API는 만들지 않는다 — 실제로 이 필드들이 한 번의 서버 호출로 나오지 않고
// 여러 라우트 + 클라이언트 계산에 흩어져 있는 게 현재 아키텍처이기 때문
async function runAnalysisPipeline(
  jdText: string,
  resumeText: string,
  coverLetterText?: string,
  portfolioText?: string
): Promise<AnalysisResult> {
  const parsedJob = await callRoute<ParsedJobResult>(parseJob, { jdText });
  const parsedApplicant = await callRoute<ParsedApplicantResult>(parseApplicant, {
    resumeText,
  });

  const matchResult = calculateMatch(
    parsedJob.required_stacks,
    parsedJob.preferred_stacks,
    parsedApplicant.stacks
  );

  const allJobStacks: CanonicalizedStack[] = [
    ...parsedJob.required_stacks,
    ...parsedJob.preferred_stacks,
  ];

  const suggestionResult = await callRoute<SuggestionResult>(suggestResume, {
    resumeText,
    coverLetterText,
    portfolioText,
    gapStacks: matchResult.gap_stacks,
    jobStacks: allJobStacks.map((stack) => stack.raw),
  });

  const confirmedStacks = suggestionResult.confirmed_gap_stacks
    .map((raw) => allJobStacks.find((stack) => stack.raw === raw))
    .filter((stack): stack is CanonicalizedStack => stack !== undefined);
  const improvedMatch = calculateMatch(parsedJob.required_stacks, parsedJob.preferred_stacks, [
    ...parsedApplicant.stacks,
    ...confirmedStacks,
  ]);

  const allGapStacks = matchResult.gap_stacks
    .map((raw) => allJobStacks.find((stack) => stack.raw === raw))
    .filter((stack): stack is CanonicalizedStack => stack !== undefined);
  const potentialMatch = calculateMatch(parsedJob.required_stacks, parsedJob.preferred_stacks, [
    ...parsedApplicant.stacks,
    ...allGapStacks,
  ]);

  const improvementSuggestions = matchResult.gap_stacks.filter(
    (stack) => !suggestionResult.confirmed_gap_stacks.includes(stack)
  );

  return {
    submission_method: parsedJob.submission_method,
    required_documents: parsedJob.required_documents,
    original_score: matchResult.score,
    improved_score: improvedMatch.score,
    potential_score: potentialMatch.score,
    gap_stacks: matchResult.gap_stacks,
    improvement_suggestions: improvementSuggestions,
    resume_suggestion: suggestionResult.resume_suggestion,
    cover_letter_suggestion: suggestionResult.cover_letter_suggestion,
    portfolio_suggestion: suggestionResult.portfolio_suggestion,
  };
}

describe("GlobalFit e2e", () => {
  it("yc-job.txt + resume-ko.txt로 실행하면 완전한 매칭 결과가 나온다", async () => {
    const jdText = readFixture("yc-job.txt");
    const resumeText = readFixture("resume-ko.txt");
    const coverLetterText = readFixture("cover-letter-ko.txt");
    const portfolioText = readFixture("portfolio-ko.txt");

    console.time("globalfit-e2e");
    const start = performance.now();
    const result = await runAnalysisPipeline(jdText, resumeText, coverLetterText, portfolioText);
    const elapsedMs = performance.now() - start;
    console.timeEnd("globalfit-e2e");

    expect(elapsedMs).toBeLessThan(10000);

    // 필드 5개 모두 존재
    expect(result.submission_method).toBeDefined();
    expect(result.required_documents).toBeDefined();
    expect(result.original_score).toBeDefined();
    expect(result.improved_score).toBeDefined();
    expect(result.potential_score).toBeDefined();

    // gap_stacks에 원문 스택명이 한글 번역 없이 포함
    expect(result.gap_stacks).toContain("Node.js");
    for (const stack of result.gap_stacks) {
      expect(stack).not.toMatch(/[가-힣]/);
    }

    // 점수는 원본 < 개선 후 < 잠재 최대 순으로 단조 증가해야 함
    expect(result.original_score).toBeLessThan(result.improved_score);
    expect(result.improved_score).toBeLessThan(result.potential_score);

    // 개선 제안서(improvement_suggestions)에만 있는 갭 항목 텍스트는
    // resume_suggestion, cover_letter_suggestion, portfolio_suggestion 본문
    // 어디에도 포함되면 안 됨
    expect(result.improvement_suggestions.length).toBeGreaterThan(0);
    for (const stack of result.improvement_suggestions) {
      expect(result.resume_suggestion).not.toContain(stack);
      expect(result.cover_letter_suggestion).not.toContain(stack);
      expect(result.portfolio_suggestion).not.toContain(stack);
    }

    // 자소서/포트폴리오를 입력했으므로 각 suggestion이 비어있지 않아야 함
    expect(result.cover_letter_suggestion.trim().length).toBeGreaterThan(0);
    expect(result.portfolio_suggestion.trim().length).toBeGreaterThan(0);
  });

  it("자소서/포트폴리오를 입력하지 않으면 각 suggestion이 빈 문자열로 반환된다", async () => {
    const jdText = readFixture("yc-job.txt");
    const resumeText = readFixture("resume-ko.txt");

    const result = await runAnalysisPipeline(jdText, resumeText);

    expect(result.cover_letter_suggestion).toBe("");
    expect(result.portfolio_suggestion).toBe("");
  });

  it("job-no-submission-method.txt는 submission_method가 'unclear'로 반환된다", async () => {
    const jdText = readFixture("job-no-submission-method.txt");

    const parsedJob = await callRoute<ParsedJobResult>(parseJob, { jdText });

    expect(parsedJob.submission_method).toBe("unclear");
  });
});
