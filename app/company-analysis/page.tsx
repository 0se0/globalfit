"use client";

import { useState } from "react";
import Link from "next/link";
import type { CompanyReport } from "@/app/api/analyze-company/route";
import { ErrorCard } from "@/components/ErrorCard";

// analyze-company 라우트는 검색으로 못 찾은 필드를 빈 문자열로 반환한다(암묵지
// 7번과 같은 "모르면 추측 금지" 원칙) — 빈 화면 대신 명시적으로 안내
function displayOrEmpty(text: string): string {
  return text.trim() ? text : "검색 결과 없음";
}

function companyReportToMarkdown(companyName: string, report: CompanyReport): string {
  const { company_info, business_analysis, environment_analysis, job_strategy, sources } =
    report;
  const recentPostings = job_strategy.recent_postings.length
    ? job_strategy.recent_postings
        .map((posting) => `- ${posting.title} (${posting.stacks.join(", ") || "스택 정보 없음"})`)
        .join("\n")
    : "검색 결과 없음";
  const sourcesText = sources.length
    ? sources.map((source) => `- [${source.title}](${source.url})`).join("\n")
    : "출처 없음";

  return `# ${companyName} 기업분석

## 기업 정보
${displayOrEmpty(company_info.general)}

### 미션/비전
${displayOrEmpty(company_info.mission_vision)}

### 기술 역량
${displayOrEmpty(company_info.tech_capability)}

## 사업 분석

### 사업 영역
${displayOrEmpty(business_analysis.business_areas)}

### 최근 뉴스
${displayOrEmpty(business_analysis.recent_news)}

### 재무 현황
${displayOrEmpty(business_analysis.financials)}

### 주요 채용 직무
${business_analysis.org_roles.length ? business_analysis.org_roles.join(", ") : "검색 결과 없음"}

## 환경 분석

### 산업 트렌드
${displayOrEmpty(environment_analysis.industry_trends)}

### 경쟁사
${displayOrEmpty(environment_analysis.competitors)}

### SWOT
- 강점: ${displayOrEmpty(environment_analysis.swot.strengths)}
- 약점: ${displayOrEmpty(environment_analysis.swot.weaknesses)}
- 기회: ${displayOrEmpty(environment_analysis.swot.opportunities)}
- 위협: ${displayOrEmpty(environment_analysis.swot.threats)}

## 채용 전략

### 최근 채용공고
${recentPostings}

### 취업 준비 로드맵
${displayOrEmpty(job_strategy.roadmap)}

## 출처
${sourcesText}
`;
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CompanyAnalysis() {
  const [companyName, setCompanyName] = useState("");
  const [roleOfInterest, setRoleOfInterest] = useState("");
  const [isAnalyzingCompany, setIsAnalyzingCompany] = useState(false);
  const [companyReport, setCompanyReport] = useState<CompanyReport | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);

  async function handleAnalyzeCompany() {
    if (!companyName.trim()) return;
    setIsAnalyzingCompany(true);
    setCompanyError(null);
    setCompanyReport(null);
    try {
      // 이 화면은 매칭 결과 화면과 별도 라우트라 parsedJob에 접근할 수 없음 —
      // 맞춤형(jobContext) 기업분석은 화면 간 상태 전달 방식이 정해지면 다시 검토
      // (docs/screens.md의 "구멍(맞춤형 기업분석)에 대한 결정" 참고)
      const res = await fetch("/api/analyze-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          roleOfInterest: roleOfInterest.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("analyze_failed");
      const data: CompanyReport = await res.json();
      setCompanyReport(data);
    } catch {
      setCompanyError("기업분석에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsAnalyzingCompany(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
        <div>
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-wide text-indigo-600"
          >
            ← GlobalFit
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">기업분석</h1>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8">
          <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1.5">
                <label
                  htmlFor="companyName"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  회사명
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="예: 네이버"
                  className="rounded-lg border border-gray-200 p-2.5 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label
                  htmlFor="roleOfInterest"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  직무 (선택)
                </label>
                <input
                  id="roleOfInterest"
                  type="text"
                  value={roleOfInterest}
                  onChange={(e) => setRoleOfInterest(e.target.value)}
                  placeholder="예: 백엔드 엔지니어"
                  className="rounded-lg border border-gray-200 p-2.5 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAnalyzeCompany}
              disabled={!companyName.trim() || isAnalyzingCompany}
              className="self-start rounded-lg bg-gray-800 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzingCompany ? "분석 중..." : "기업분석 보기"}
            </button>
          </div>

          {companyError && (
            <ErrorCard message={companyError} onRetry={handleAnalyzeCompany} />
          )}

          {companyReport && (
            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-800 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {companyName} 기업분석
                  {companyReport.job_strategy.personalized && " (입력한 공고 맞춤)"}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadMarkdown(
                      `${companyName}-기업분석.md`,
                      companyReportToMarkdown(companyName, companyReport)
                    )
                  }
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
                >
                  MD로 저장
                </button>
              </div>

              <details className="rounded-lg border border-gray-100 p-3" open>
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                  기업 정보
                </summary>
                <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600">
                  <p>{displayOrEmpty(companyReport.company_info.general)}</p>
                  <p>
                    <span className="font-medium text-gray-700">미션/비전:</span>{" "}
                    {displayOrEmpty(companyReport.company_info.mission_vision)}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">기술 역량:</span>{" "}
                    {displayOrEmpty(companyReport.company_info.tech_capability)}
                  </p>
                </div>
              </details>

              <details className="rounded-lg border border-gray-100 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                  사업 분석
                </summary>
                <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600">
                  <p>
                    <span className="font-medium text-gray-700">사업 영역:</span>{" "}
                    {displayOrEmpty(companyReport.business_analysis.business_areas)}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">최근 뉴스:</span>{" "}
                    {displayOrEmpty(companyReport.business_analysis.recent_news)}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">재무 현황:</span>{" "}
                    {displayOrEmpty(companyReport.business_analysis.financials)}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">주요 채용 직무:</span>{" "}
                    {companyReport.business_analysis.org_roles.join(", ") || "검색 결과 없음"}
                  </p>
                </div>
              </details>

              <details className="rounded-lg border border-gray-100 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                  환경 분석
                </summary>
                <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600">
                  <p>
                    <span className="font-medium text-gray-700">산업 트렌드:</span>{" "}
                    {displayOrEmpty(companyReport.environment_analysis.industry_trends)}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">경쟁사:</span>{" "}
                    {displayOrEmpty(companyReport.environment_analysis.competitors)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <p>
                      <span className="font-medium text-gray-700">강점:</span>{" "}
                      {displayOrEmpty(companyReport.environment_analysis.swot.strengths)}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">약점:</span>{" "}
                      {displayOrEmpty(companyReport.environment_analysis.swot.weaknesses)}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">기회:</span>{" "}
                      {displayOrEmpty(companyReport.environment_analysis.swot.opportunities)}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">위협:</span>{" "}
                      {displayOrEmpty(companyReport.environment_analysis.swot.threats)}
                    </p>
                  </div>
                </div>
              </details>

              <details className="rounded-lg border border-gray-100 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                  채용 전략
                </summary>
                <div className="mt-2 flex flex-col gap-3 text-sm text-gray-600">
                  <div>
                    <p className="mb-1 font-medium text-gray-700">최근 채용공고</p>
                    {companyReport.job_strategy.recent_postings.length === 0 ? (
                      <p>검색 결과 없음</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {companyReport.job_strategy.recent_postings.map((posting, i) => (
                          <li key={i}>
                            {posting.title}
                            {posting.stacks.length > 0 && (
                              <span className="text-gray-400"> — {posting.stacks.join(", ")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {companyReport.job_strategy.aggregated_stacks.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-gray-700">최근 채용 스택 (참고용)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {companyReport.job_strategy.aggregated_stacks.map((stack) => (
                          <span
                            key={stack.raw}
                            className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                          >
                            {stack.raw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 font-medium text-gray-700">취업 준비 로드맵</p>
                    <p>{displayOrEmpty(companyReport.job_strategy.roadmap)}</p>
                  </div>
                </div>
              </details>

              {companyReport.sources.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    출처
                  </p>
                  <ul className="flex flex-col gap-1 text-xs text-gray-500">
                    {companyReport.sources.map((source, i) => (
                      <li key={i}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-gray-700"
                        >
                          {source.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
