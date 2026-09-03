"use client";

import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { calculateMatch } from "@/lib/calculate-match";
import type { CanonicalizedStack } from "@/lib/canonicalize-stacks";
import { mergeCompanyStacksIntoPreferred } from "@/lib/merge-company-stacks";
import { ErrorCard } from "@/components/ErrorCard";
import type { CompanyReport } from "@/app/api/analyze-company/route";

// 서버가 못 가져오는 사이트(봇 차단, IP 평판 차단 등)에서 쓰는 북마클릿 —
// 사용자 본인 브라우저에서 실행되므로 서버측 차단과 무관하게 항상 동작함.
// 페이지 전체를 그대로 긁어옴 — 광고/배너 같은 노이즈는 사용자가 선택해서
// 거르게 하지 않고, 이후 Gemini 파싱 단계(슬라이스 04)에서 걸러지게 둠
const BOOKMARKLET_HREF =
  "javascript:(function(){var c=document.body.cloneNode(true);c.querySelectorAll('script,style,nav,header,footer,aside,noscript').forEach(function(e){e.remove()});var t=c.textContent.replace(/\\s+/g,' ').trim();navigator.clipboard.writeText(t).then(function(){alert('텍스트가 복사되었습니다 ('+t.length+'자). GlobalFit 탭에서 붙여넣어 주세요.')}).catch(function(){alert('복사에 실패했습니다. 이 사이트가 클립보드 접근을 막고 있을 수 있어요.')})})();";

const STORAGE_KEY = "globalfit:last-session";
const URL_ONLY_PATTERN = /^https?:\/\/\S+$/i;
// localStorage 용량 한계(브라우저마다 다르지만 보통 5~10MB) 때문에 base64로
// 저장할 파일 크기를 제한 — base64는 원본보다 約33% 커짐
const MAX_RESUME_FILE_SIZE = 3 * 1024 * 1024;

interface UploadedFile {
  name: string;
  type: string;
  dataBase64: string;
}

interface SavedEntry {
  jdText: string;
  resumeText: string;
  resumeFile: UploadedFile | null;
  coverLetterText: string;
  coverLetterFile: UploadedFile | null;
  portfolioText: string;
  portfolioFile: UploadedFile | null;
  savedAt: string;
}

interface ParsedJob {
  required_stacks: CanonicalizedStack[];
  preferred_stacks: CanonicalizedStack[];
  submission_method: "company_site" | "job_platform" | "email" | "unclear";
  required_documents: string[];
}

interface ParsedApplicant {
  stacks: CanonicalizedStack[];
  projects: string[];
  years_of_experience: string;
  experience: string[];
}

interface JudgeResult {
  ambiguous_requirements: { original_text: string; interpretation: string }[];
  low_confidence_fields: { field: string; reason: string }[];
  keyword_lookups: { stack_name: string; canonical: string | null; registered: boolean }[];
  tool_call_count: number;
  skipped: boolean;
}

interface ApplicantInput {
  resumeText?: string;
  resumeFile?: { dataBase64: string; mimeType: string };
}

interface SuggestionResult {
  resume_suggestion: string;
  cover_letter_suggestion: string;
  portfolio_suggestion: string;
  confirmed_gap_stacks: string[];
  interview_questions: string[];
  narrative_gaps: string[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64ToFile(uploadedFile: UploadedFile): File {
  const bytes = atob(uploadedFile.dataBase64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new File([array], uploadedFile.name, { type: uploadedFile.type });
}

async function extractUploadedFileText(uploadedFile: UploadedFile): Promise<string> {
  const formData = new FormData();
  formData.append("file", base64ToFile(uploadedFile));
  const res = await fetch("/api/parse-resume", { method: "POST", body: formData });
  if (!res.ok) throw new Error("extract_failed");
  const data: { text: string } = await res.json();
  return data.text;
}

const SUBMISSION_METHOD_LABELS: Record<ParsedJob["submission_method"], string> = {
  company_site: "회사 홈페이지",
  job_platform: "채용 플랫폼",
  email: "이메일",
  unclear: "명시되지 않음",
};

// 디자인 시스템: 딥그린은 "결과 숫자"에만 쓰는 고정 색이라 점수 구간별로
// 색을 바꾸지 않는다 (docs/design/Global Fit 디자인시스템.dc.html 참고)
const SCORE_COLOR_CLASS = "text-deepgreen";

// analyze-company 라우트는 제공된 자료에서 못 찾은 필드를 빈 문자열로 반환한다
// (암묵지 7번과 같은 "모르면 추측 금지" 원칙) — 빈 화면 대신 명시적으로 안내
function displayOrEmpty(text: string): string {
  return text.trim() ? text : "제공된 자료에서 확인 불가";
}

// 분석 중 버튼이 멈춘 건지 헷갈린다는 피드백으로 추가 — 점 3개가 순서대로
// 튀어오르는 파도 모양이라 정지된 텍스트보다 "지금 진행 중"이라는 게 분명함.
// bg-current라 버튼 글자색을 그대로 물려받음 (라임 버튼 위 잉크색 등)
function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 animate-wave-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-2.5 w-2.5 animate-wave-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-2.5 w-2.5 animate-wave-bounce rounded-full bg-current" />
    </span>
  );
}

// 준비 로드맵과 SWOT 전략(SO/WO/ST/WT) 4개 버킷이 전부 "키워드 + 설명" 불릿
// 형태를 공유해서 하나로 묶음 — 줄글 대신 한눈에 훑을 수 있게 하기 위함
function StrategyBulletList({ items }: { items: { keyword: string; description: string }[] }) {
  if (items.length === 0) {
    return <p className="mt-1 text-muted">제공된 자료에서 확인 불가</p>;
  }
  return (
    <ul className="mt-2 flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 text-deepgreen">●</span>
          <div>
            <p className="font-semibold text-ink">{item.keyword}</p>
            <p className="mt-0.5 text-muted">{item.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PlainBulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="mt-1 text-muted">제공된 자료에서 확인 불가</p>;
  }
  return (
    <ul className="mt-1.5 flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-0.5 text-deepgreen">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const MAX_COMPANY_URLS = 3;

function parseCompanyUrls(rawText: string): string[] {
  return Array.from(
    new Set(
      rawText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => URL_ONLY_PATTERN.test(line))
    )
  ).slice(0, MAX_COMPANY_URLS);
}

function companyReportToMarkdown(companyName: string, report: CompanyReport): string {
  const {
    company_info,
    business_analysis,
    role_understanding,
    environment_analysis,
    job_strategy,
    sources,
  } = report;
  const bulletsOrEmpty = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "제공된 자료에서 확인 불가";
  const recentPostings = job_strategy.recent_postings.length
    ? job_strategy.recent_postings
        .map((posting) => `- ${posting.title} (${posting.stacks.join(", ") || "스택 정보 없음"})`)
        .join("\n")
    : "제공된 자료에서 확인 불가";
  const sourcesText = sources.length
    ? sources.map((source) => `- [${source.title}](${source.url})`).join("\n")
    : "출처 없음";
  const roadmapText = job_strategy.roadmap.length
    ? job_strategy.roadmap.map((item) => `- **${item.keyword}**: ${item.description}`).join("\n")
    : "제공된 자료에서 확인 불가";
  const strategyItemsText = (items: { keyword: string; description: string }[]) =>
    items.length
      ? items.map((item) => `- **${item.keyword}**: ${item.description}`).join("\n")
      : "제공된 자료에서 확인 불가";

  return `# ${companyName} 기업분석

## 기업 정보
${displayOrEmpty(company_info.general)}

### 미션/비전
${displayOrEmpty(company_info.mission_vision)}

### 기술 역량
${displayOrEmpty(company_info.tech_capability)}

### 인재상
${displayOrEmpty(company_info.talent_profile)}

## 사업 분석

### 사업 영역
${displayOrEmpty(business_analysis.business_areas)}

### 현재 집중 프로젝트
${displayOrEmpty(business_analysis.current_focus)}

### 미래·사업 방향
${displayOrEmpty(business_analysis.future_direction)}

### 최근 뉴스
${displayOrEmpty(business_analysis.recent_news)}

### 재무 현황
${displayOrEmpty(business_analysis.financials)}

### 주요 채용 직무
${business_analysis.org_roles.length ? business_analysis.org_roles.join(", ") : "검색 결과 없음"}

## 직무 이해

### 이 회사에서 이 직무의 업무 성격
${displayOrEmpty(role_understanding.core_work_type)}

### 타사 동일 직무와의 차이
${displayOrEmpty(role_understanding.differs_from_peers)}

### 필요 역량
${bulletsOrEmpty(role_understanding.required_capabilities)}

### 비즈니스 적응 근거 (자소서용)
${bulletsOrEmpty(role_understanding.business_fit_points)}

### 하루 일과
${displayOrEmpty(role_understanding.daily_work)}

### 3·5·7년 뒤 업무 범위 변화
${displayOrEmpty(role_understanding.growth_path)}

### 비정기 이슈 실무 대응
${displayOrEmpty(role_understanding.irregular_issues)}

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

### SWOT 전략 (TOWS)
**SO — 강점으로 기회 잡기**
${strategyItemsText(environment_analysis.swot_strategies.so)}

**WO — 약점 보완해 기회 잡기**
${strategyItemsText(environment_analysis.swot_strategies.wo)}

**ST — 강점으로 위협 방어**
${strategyItemsText(environment_analysis.swot_strategies.st)}

**WT — 약점·위협 리스크 최소화**
${strategyItemsText(environment_analysis.swot_strategies.wt)}

### PEST
- 정치: ${displayOrEmpty(environment_analysis.pest.political)}
- 경제: ${displayOrEmpty(environment_analysis.pest.economic)}
- 사회: ${displayOrEmpty(environment_analysis.pest.social)}
- 기술: ${displayOrEmpty(environment_analysis.pest.technological)}

## 채용 전략

### 최근 채용공고
${recentPostings}

### 취업 준비 로드맵
${roadmapText}

### 직접 알아볼 것 (회사 자료에 없어 직접 조사 필요)
${strategyItemsText(job_strategy.self_research_guide)}

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

// PDF는 Gemini가 파일을 직접 읽고 구조화까지 한 번에 하므로(parse-applicant),
// 텍스트만 따로 추출하는 /api/parse-resume 호출(무료 티어 일일 호출 소모)을
// 건너뛴다. DOCX/HTML은 추출 자체가 로컬 라이브러리(mammoth/cheerio)라 무료라
// 합칠 이유가 없어 기존 방식(추출 후 구조화, 2단계) 유지
function isPdfFile(resumeFile: UploadedFile): boolean {
  return (
    resumeFile.type === "application/pdf" ||
    resumeFile.name.toLowerCase().endsWith(".pdf")
  );
}

export default function Home() {
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<UploadedFile | null>(null);
  const [coverLetterText, setCoverLetterText] = useState("");
  const [coverLetterFile, setCoverLetterFile] = useState<UploadedFile | null>(null);
  const [portfolioText, setPortfolioText] = useState("");
  const [portfolioFile, setPortfolioFile] = useState<UploadedFile | null>(null);
  const [savedEntry, setSavedEntry] = useState<SavedEntry | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [resumeFileError, setResumeFileError] = useState<string | null>(null);
  const [coverLetterFileError, setCoverLetterFileError] = useState<string | null>(null);
  const [portfolioFileError, setPortfolioFileError] = useState<string | null>(null);
  const [isParsingJob, setIsParsingJob] = useState(false);
  const [parsedJob, setParsedJob] = useState<ParsedJob | null>(null);
  const [parseJobError, setParseJobError] = useState<string | null>(null);
  const [isParsingApplicant, setIsParsingApplicant] = useState(false);
  const [parsedApplicant, setParsedApplicant] = useState<ParsedApplicant | null>(null);
  const [parseApplicantError, setParseApplicantError] = useState<string | null>(null);
  const [isJudgingJob, setIsJudgingJob] = useState(false);
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [applicantInput, setApplicantInput] = useState<ApplicantInput | null>(null);
  const [isSuggestingResume, setIsSuggestingResume] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResult | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [roleOfInterest, setRoleOfInterest] = useState("");
  const [companyUrlsText, setCompanyUrlsText] = useState("");
  const [isAnalyzingCompany, setIsAnalyzingCompany] = useState(false);
  const [companyReport, setCompanyReport] = useState<CompanyReport | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companyFetchWarning, setCompanyFetchWarning] = useState<string | null>(null);
  // 공고 파싱(STEP 01) 완료 후 "공고 맞춤 재분석" 시 URL을 다시 가져오지 않고
  // 재사용하기 위해 보관 — 기업분석(STEP 00)은 공고 입력보다 먼저 실행되므로
  // 최초 호출 시점엔 jobContext가 존재하지 않는다
  const [companySourceTexts, setCompanySourceTexts] = useState<{ url: string; text: string }[]>([]);
  const [isPersonalizingCompany, setIsPersonalizingCompany] = useState(false);
  const [view, setView] = useState<"company" | "matching">("company");
  const isJdUrl = URL_ONLY_PATTERN.test(jdText.trim());
  const isEmpty = !jdText.trim() || (!resumeText.trim() && !resumeFile);
  // 매칭 점수는 기업분석을 먼저 완료해야만 확인할 수 있다 (2026-08-29 결정) —
  // 기업분석 없이 공고/이력서만으로 매칭하는 경로는 더 이상 허용하지 않는다
  const isBlocked = isJdUrl || isEmpty || !companyReport;
  // "매칭 결과 보기" 클릭 후 결과 카드가 나타나기 전까지 사용자가 버튼이 눌렸는지
  // 알 수 없다는 피드백이 있어 추가 — 공고 분석/이력서 분석/판단 지점 중 하나라도
  // 진행 중이면 true (calculateMatch 자체는 순수 함수라 로딩 상태가 없음)
  const isMatching = isParsingJob || isParsingApplicant || isJudgingJob;
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  // 기업분석을 실행했다면 그 회사의 "최근 채용공고 요구 스택"을 이 공고의
  // preferred_stacks에 합쳐서 매칭에 반영한다 (2026-08-29 결정, CLAUDE.md 참고).
  // 기업분석을 안 했으면 JD의 preferred_stacks만 그대로 쓴다
  const effectivePreferredStacks = useMemo(
    () =>
      mergeCompanyStacksIntoPreferred(
        parsedJob?.preferred_stacks ?? [],
        companyReport?.job_strategy.aggregated_stacks
      ),
    [parsedJob, companyReport]
  );

  // API 키가 필요 없는 순수 계산이라 서버로 보내지 않고 클라이언트에서 바로
  // 계산한다 (불필요한 네트워크 왕복 없음)
  const matchResult = useMemo(() => {
    if (!parsedJob || !parsedApplicant) return null;
    return calculateMatch(
      parsedJob.required_stacks,
      effectivePreferredStacks,
      parsedApplicant.stacks
    );
  }, [parsedJob, parsedApplicant, effectivePreferredStacks]);

  // 재구성 제안이 "새로 찾아낸" 스택(confirmed_gap_stacks)은 원본에 이미 있었지만
  // 05가 처음에 놓친 것뿐이라, 원본 required/preferred 목록에서 같은 raw 이름의
  // CanonicalizedStack을 그대로 가져와 합친다 — 새로 캐노니컬라이즈하지 않음
  // (08의 calculateMatch는 여전히 순수 함수 그대로 재사용, 하드 룰 4번 유지)
  const improvedMatch = useMemo(() => {
    if (!parsedJob || !parsedApplicant || !suggestionResult) return null;
    const allJobStacks = [...parsedJob.required_stacks, ...effectivePreferredStacks];
    const confirmedStacks = suggestionResult.confirmed_gap_stacks
      .map((raw) => allJobStacks.find((stack) => stack.raw === raw))
      .filter((stack): stack is CanonicalizedStack => stack !== undefined);
    return calculateMatch(parsedJob.required_stacks, effectivePreferredStacks, [
      ...parsedApplicant.stacks,
      ...confirmedStacks,
    ]);
  }, [parsedJob, parsedApplicant, suggestionResult, effectivePreferredStacks]);

  // 잠재 최대 점수: confirmed 여부와 무관하게 matchResult의 gap_stacks(최대 3개)를
  // 전부 채웠다고 가정 — improvedMatch와 같은 병합 패턴, 대상만 다르다
  const potentialMatch = useMemo(() => {
    if (!parsedJob || !parsedApplicant || !matchResult || !suggestionResult) return null;
    const allJobStacks = [...parsedJob.required_stacks, ...effectivePreferredStacks];
    const allGapStacks = matchResult.gap_stacks
      .map((raw) => allJobStacks.find((stack) => stack.raw === raw))
      .filter((stack): stack is CanonicalizedStack => stack !== undefined);
    return calculateMatch(parsedJob.required_stacks, effectivePreferredStacks, [
      ...parsedApplicant.stacks,
      ...allGapStacks,
    ]);
  }, [parsedJob, parsedApplicant, matchResult, suggestionResult, effectivePreferredStacks]);

  // 개선 제안서: gap_stacks 중 11에서 "원본에 없다"고 판정된(=confirmed_gap_stacks에
  // 없는) 항목들 — resume_suggestion 생성에 애초에 입력으로 들어가지 않아 구조적으로
  // 본문과 섞이지 않는다
  const improvementSuggestions = useMemo(() => {
    if (!matchResult || !suggestionResult) return null;
    return matchResult.gap_stacks.filter(
      (stack) => !suggestionResult.confirmed_gap_stacks.includes(stack)
    );
  }, [matchResult, suggestionResult]);

  useEffect(() => {
    // React 19이 XSS 방지 차원에서 javascript: href를 JSX 단계에서 무력화시켜서
    // (드래그해도 실제 스크립트 대신 에러가 복사됨) — ref로 DOM에 직접 설정해서 우회
    bookmarkletRef.current?.setAttribute("href", BOOKMARKLET_HREF);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entry: SavedEntry = JSON.parse(raw);
    // localStorage는 서버에 없어 useState 초기값으로 바로 읽으면 하이드레이션 불일치가 남 —
    // 마운트 후 effect에서 한 번만 동기화하는 게 유일한 방법
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJdText(entry.jdText);
    setResumeText(entry.resumeText);
    setResumeFile(entry.resumeFile ?? null);
    setCoverLetterText(entry.coverLetterText ?? "");
    setCoverLetterFile(entry.coverLetterFile ?? null);
    setPortfolioText(entry.portfolioText ?? "");
    setPortfolioFile(entry.portfolioFile ?? null);
    setSavedEntry(entry);
  }, []);

  async function handleFetchUrl() {
    setIsFetchingUrl(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/fetch-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jdText.trim() }),
      });
      if (!res.ok) throw new Error("fetch_failed");
      const data: { text: string } = await res.json();
      setJdText(data.text);
    } catch {
      setFetchError(
        "이 URL을 가져올 수 없습니다. 텍스트로 복사해서 붙여넣어 주세요."
      );
    } finally {
      setIsFetchingUrl(false);
    }
  }

  // 이력서/자소서/포트폴리오 세 슬롯이 파일 첨부·검증 로직을 동일하게
  // 공유하므로 팩토리로 묶음 — 각 슬롯은 독립된 상태(파일/텍스트/에러)만 다름
  function makeFileChangeHandler(
    setFile: (f: UploadedFile | null) => void,
    setText: (t: string) => void,
    setError: (e: string | null) => void
  ) {
    return async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 다시 발생하도록
      if (!file) return;

      if (file.name.toLowerCase().endsWith(".hwp")) {
        setError("HWP는 아직 지원하지 않습니다. 텍스트로 복사해서 붙여넣어 주세요.");
        return;
      }
      if (file.size > MAX_RESUME_FILE_SIZE) {
        setError("파일이 너무 큽니다 (3MB 이하만 가능합니다). 텍스트로 복사해서 붙여넣어 주세요.");
        return;
      }

      setError(null);
      const dataBase64 = await fileToBase64(file);
      setFile({ name: file.name, type: file.type, dataBase64 });
      setText("");
    };
  }

  const handleFileChange = makeFileChangeHandler(setResumeFile, setResumeText, setResumeFileError);
  const handleCoverLetterFileChange = makeFileChangeHandler(
    setCoverLetterFile,
    setCoverLetterText,
    setCoverLetterFileError
  );
  const handlePortfolioFileChange = makeFileChangeHandler(
    setPortfolioFile,
    setPortfolioText,
    setPortfolioFileError
  );

  function handleRemoveFile() {
    setResumeFile(null);
  }

  async function runJudgeJob(text: string, parsedJobData: ParsedJob) {
    setIsJudgingJob(true);
    setJudgeError(null);
    try {
      const judgeRes = await fetch("/api/judge-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText: text, parsedJob: parsedJobData }),
      });
      if (!judgeRes.ok) throw new Error("judge_failed");
      const judgeData: JudgeResult = await judgeRes.json();
      setJudgeResult(judgeData);
    } catch {
      setJudgeError("판단 지점 분석에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsJudgingJob(false);
    }
  }

  async function runParseJob(text: string) {
    setIsParsingJob(true);
    setParseJobError(null);
    setParsedJob(null);
    setIsJudgingJob(false);
    setJudgeResult(null);
    setJudgeError(null);
    try {
      const res = await fetch("/api/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText: text }),
      });
      if (!res.ok) throw new Error("parse_failed");
      const data: ParsedJob = await res.json();
      setParsedJob(data);
      setIsParsingJob(false);
      await runJudgeJob(text, data);
    } catch {
      setParseJobError("공고 분석에 실패했습니다. 다시 시도해주세요.");
      setIsParsingJob(false);
    }
  }

  async function runParseApplicant(text: string, file: UploadedFile | null) {
    setIsParsingApplicant(true);
    setParseApplicantError(null);
    setParsedApplicant(null);
    setApplicantInput(null);
    setSuggestionResult(null);
    setSuggestionError(null);
    try {
      let body: ApplicantInput;
      if (file && isPdfFile(file)) {
        body = {
          resumeFile: {
            dataBase64: file.dataBase64,
            mimeType: file.type || "application/pdf",
          },
        };
      } else {
        const resolvedText = file ? await extractUploadedFileText(file) : text;
        body = { resumeText: resolvedText };
      }
      setApplicantInput(body);
      const res = await fetch("/api/parse-applicant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("parse_failed");
      const data: ParsedApplicant = await res.json();
      setParsedApplicant(data);
    } catch {
      setParseApplicantError("이력서 분석에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsParsingApplicant(false);
    }
  }

  async function runSuggestResume(gapStacks: string[], jobStacks: string[]) {
    if (!applicantInput) return;
    setIsSuggestingResume(true);
    setSuggestionError(null);
    setSuggestionResult(null);
    try {
      // 자소서/포트폴리오는 텍스트 대신 파일로 왔을 수 있음 — 이 시점에만
      // 필요하므로 제출(handleSubmit) 때가 아니라 여기서 지연 추출한다
      const [resolvedCoverLetterText, resolvedPortfolioText] = await Promise.all([
        coverLetterFile ? extractUploadedFileText(coverLetterFile) : coverLetterText.trim(),
        portfolioFile ? extractUploadedFileText(portfolioFile) : portfolioText.trim(),
      ]);
      const res = await fetch("/api/suggest-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...applicantInput,
          coverLetterText: resolvedCoverLetterText || undefined,
          portfolioText: resolvedPortfolioText || undefined,
          gapStacks,
          jobStacks,
        }),
      });
      if (!res.ok) throw new Error("suggest_failed");
      const data: SuggestionResult = await res.json();
      setSuggestionResult(data);
    } catch {
      setSuggestionError("이력서 재구성 제안에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSuggestingResume(false);
    }
  }

  async function handleAnalyzeCompany() {
    if (!companyName.trim()) return;
    const urls = parseCompanyUrls(companyUrlsText);
    if (urls.length === 0) {
      setCompanyError("회사 관련 URL을 최소 1개 입력해주세요 (회사 홈페이지, 보도자료, 뉴스 기사 등).");
      return;
    }
    setIsAnalyzingCompany(true);
    setCompanyError(null);
    setCompanyFetchWarning(null);
    setCompanyReport(null);
    try {
      const fetchResults = await Promise.allSettled(
        urls.map(async (url) => {
          const res = await fetch("/api/fetch-job", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          if (!res.ok) throw new Error("fetch_failed");
          const data: { text: string } = await res.json();
          return { url, text: data.text };
        })
      );

      const sourceTexts = fetchResults
        .filter(
          (r): r is PromiseFulfilledResult<{ url: string; text: string }> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value);
      const failedCount = urls.length - sourceTexts.length;

      if (sourceTexts.length === 0) {
        setCompanyError(
          "입력한 URL에서 정보를 가져오지 못했습니다. 다른 URL을 시도하거나 URL을 확인해주세요."
        );
        return;
      }
      if (failedCount > 0) {
        setCompanyFetchWarning(
          `URL ${urls.length}개 중 ${failedCount}개를 가져오지 못해 나머지 ${sourceTexts.length}개만으로 분석합니다.`
        );
      }

      const res = await fetch("/api/analyze-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          roleOfInterest: roleOfInterest.trim() || undefined,
          sourceTexts,
        }),
      });
      if (!res.ok) throw new Error("analyze_failed");
      const data: CompanyReport = await res.json();
      setCompanyReport(data);
      setCompanySourceTexts(sourceTexts);
    } catch {
      setCompanyError("기업분석에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsAnalyzingCompany(false);
    }
  }

  // STEP 00(기업분석)은 공고 입력보다 먼저 실행되므로 그 시점엔 jobContext가
  // 없다. 공고 파싱이 끝난 뒤 사용자가 원하면 같은 sourceTexts로 로드맵만
  // 공고 맞춤으로 다시 받는다 — 자동 재호출은 안 함 (무료 티어 호출 절약 원칙)
  async function handlePersonalizeCompany() {
    if (!parsedJob || companySourceTexts.length === 0) return;
    setIsPersonalizingCompany(true);
    setCompanyError(null);
    try {
      const res = await fetch("/api/analyze-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          roleOfInterest: roleOfInterest.trim() || undefined,
          sourceTexts: companySourceTexts,
          jobContext: {
            requiredStacks: parsedJob.required_stacks.map((s) => s.canonical ?? s.raw),
            preferredStacks: parsedJob.preferred_stacks.map((s) => s.canonical ?? s.raw),
          },
        }),
      });
      if (!res.ok) throw new Error("analyze_failed");
      const data: CompanyReport = await res.json();
      setCompanyReport(data);
    } catch {
      setCompanyError("기업분석 맞춤 재분석에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsPersonalizingCompany(false);
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const entry: SavedEntry = {
      jdText,
      resumeText,
      resumeFile,
      coverLetterText,
      coverLetterFile,
      portfolioText,
      portfolioFile,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    setSavedEntry(entry);

    await Promise.all([
      runParseJob(jdText),
      runParseApplicant(resumeText, resumeFile),
    ]);
  }

  function handleReset() {
    localStorage.removeItem(STORAGE_KEY);
    setJdText("");
    setResumeText("");
    setResumeFile(null);
    setCoverLetterText("");
    setCoverLetterFile(null);
    setPortfolioText("");
    setPortfolioFile(null);
    setSavedEntry(null);
    setFetchError(null);
    setResumeFileError(null);
    setCoverLetterFileError(null);
    setPortfolioFileError(null);
    setParsedJob(null);
    setParseJobError(null);
    setParsedApplicant(null);
    setParseApplicantError(null);
    setJudgeResult(null);
    setJudgeError(null);
    setApplicantInput(null);
    setSuggestionResult(null);
    setSuggestionError(null);
    setCompanyName("");
    setRoleOfInterest("");
    setCompanyUrlsText("");
    setCompanyReport(null);
    setCompanyError(null);
    setCompanyFetchWarning(null);
    setCompanySourceTexts([]);
  }

  return (
    <div className="min-h-screen bg-surface-alt text-ink">
      <div className="flex w-full flex-col gap-8 px-5 py-14 sm:px-10 lg:px-16">
        <div className="flex items-baseline gap-2.5 border-b border-line pb-6">
          <span className="text-4xl font-bold tracking-tight text-leaf">Global Fit</span>
          <span className="font-outfit text-xs uppercase tracking-[.16em] text-muted">
            공고 × 내 문서
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-limewash-line bg-limewash px-3 py-1 font-outfit text-xs font-semibold uppercase tracking-[.1em] text-deepgreen">
              무료 · 회원가입 없음
            </span>
            <h1 className="text-3xl leading-[1.1] font-bold tracking-tight sm:text-[32px]">
              이 공고에 내가 얼마나 맞는지<span className="text-ghost"> 확인하기</span>
            </h1>
            <p className="max-w-[56ch] text-base leading-relaxed text-muted">
              공고와 이력서를 넣으면 요구 스택 대비 매칭 점수, 제출 방법, 부족한 부분을
              뽑아냅니다. 자소서·포트폴리오를 함께 넣으면 세 문서 모두 재구성 제안을 받습니다.
            </p>
          </div>

          {view === "company" && (
          <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3.5 rounded-xl border border-line border-l-4 border-l-deepgreen bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="font-outfit text-2xl font-bold uppercase tracking-[.02em] text-deepgreen">
                STEP 00 — 기업분석
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="companyName" className="text-lg font-medium">
                  회사명
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    // 회사명이 바뀌면 이전 기업분석 결과는 더 이상 유효하지 않음 —
                    // 그대로 두면 매칭 점수가 화면에 보이는 회사명과 다른 회사의
                    // aggregated_stacks로 계산되는 상황이 생길 수 있음
                    setCompanyReport(null);
                    setCompanyError(null);
                  }}
                  placeholder="예: 주식회사 메리디안"
                  className="rounded-[9px] border border-line p-3 text-base outline-none transition focus:border-deepgreen"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="roleOfInterest" className="text-lg font-medium">
                  관심 직무 <span className="font-normal text-muted">선택</span>
                </label>
                <input
                  id="roleOfInterest"
                  type="text"
                  value={roleOfInterest}
                  onChange={(e) => {
                    setRoleOfInterest(e.target.value);
                    setCompanyReport(null);
                    setCompanyError(null);
                  }}
                  placeholder="예: 백엔드 엔지니어"
                  className="rounded-[9px] border border-line p-3 text-base outline-none transition focus:border-deepgreen"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="companyUrls" className="text-lg font-medium">
                회사 관련 URL <span className="font-normal text-muted">최대 {MAX_COMPANY_URLS}개, 줄바꿈으로 구분</span>
              </label>
              <textarea
                id="companyUrls"
                value={companyUrlsText}
                onChange={(e) => {
                  setCompanyUrlsText(e.target.value);
                  setCompanyReport(null);
                  setCompanyError(null);
                  setCompanyFetchWarning(null);
                  setCompanySourceTexts([]);
                }}
                placeholder={"예:\nhttps://company.com (회사 홈페이지)\nhttps://company.com/news (보도자료)\nhttps://news.site/article (뉴스 기사)"}
                className="min-h-24 rounded-[9px] border border-line p-3 text-base leading-relaxed outline-none transition focus:border-deepgreen"
              />
              <span className="text-[13px] text-muted">
                회사 소개·최근 뉴스 등 회사 전반에 대한 URL을 서버가 직접 가져와 분석 자료로
                씁니다. 지금 지원하는 공고 자체는 다음 단계(STEP 01)에서 따로 입력해요.
              </span>
            </div>
            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted">
                {!companyName.trim() ? (
                  <span>회사명을 입력하면 버튼이 열립니다</span>
                ) : isAnalyzingCompany ? (
                  <span className="inline-flex items-center gap-2 font-medium text-deepgreen">
                    기업분석 중입니다 — 완료되면 아래에 리포트가 표시됩니다
                    <LoadingDots />
                  </span>
                ) : companyReport ? (
                  <span>기업분석 완료 · 공고를 반영해 다시 실행할 수 있습니다</span>
                ) : (
                  <span>회사명 확인됨 · 분석에 약 20초</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleAnalyzeCompany}
                disabled={!companyName.trim() || isAnalyzingCompany}
                className="inline-flex items-center justify-center gap-2 self-start rounded-[9px] border border-lime bg-lime px-5 py-2.5 text-base font-semibold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-line disabled:bg-disabled-bg disabled:text-disabled-text disabled:hover:brightness-100"
              >
                {isAnalyzingCompany
                  ? "분석 중..."
                  : companyReport
                    ? "기업분석 다시 실행"
                    : "기업분석 보기"}
              </button>
            </div>
          </div>

          {companyFetchWarning && (
            <p className="text-[13px] text-muted">{companyFetchWarning}</p>
          )}
          {companyError && (
            <ErrorCard message={companyError} onRetry={handleAnalyzeCompany} />
          )}

          {companyReport && (
            <div className="flex flex-col gap-5 rounded-xl border border-line bg-white p-5">
              <div className="flex items-end justify-between gap-3 border-b border-line pb-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{companyName}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {roleOfInterest.trim() ? `${roleOfInterest} 관점 · ` : ""}
                    출처 {companyReport.sources.length}건
                    {companyReport.job_strategy.personalized && " · 입력한 공고 맞춤"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadMarkdown(
                      `${companyName}-기업분석.md`,
                      companyReportToMarkdown(companyName, companyReport)
                    )
                  }
                  className="shrink-0 rounded-[8px] border border-line bg-white px-3.5 py-2 text-[13px] font-medium"
                >
                  마크다운 다운로드
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-[10px] border border-line p-3.5">
                  <p className="mb-1.5 text-[13px] text-muted">기업 정보</p>
                  <p className="text-base leading-relaxed">
                    {displayOrEmpty(companyReport.company_info.general)}
                  </p>
                </div>
                <div className="rounded-[10px] border border-line p-3.5">
                  <p className="mb-1.5 text-[13px] text-muted">미션/비전</p>
                  <p className="text-base leading-relaxed">
                    {displayOrEmpty(companyReport.company_info.mission_vision)}
                  </p>
                </div>
                <div className="rounded-[10px] border border-line p-3.5">
                  <p className="mb-1.5 text-[13px] text-muted">기술 역량</p>
                  <p className="text-base leading-relaxed">
                    {displayOrEmpty(companyReport.company_info.tech_capability)}
                  </p>
                </div>
                <div className="rounded-[10px] border border-line p-3.5">
                  <p className="mb-1.5 text-[13px] text-muted">인재상</p>
                  <p className="text-base leading-relaxed">
                    {displayOrEmpty(companyReport.company_info.talent_profile)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-[12px] border border-line">
                  <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                    사업분석
                  </div>
                  <div className="flex flex-col gap-2.5 p-4 text-sm leading-relaxed">
                    <p>
                      <span className="font-medium">사업 영역 ·</span>{" "}
                      {displayOrEmpty(companyReport.business_analysis.business_areas)}
                    </p>
                    <p className="border-t border-line-soft pt-2.5">
                      <span className="font-medium">현재 집중 프로젝트 ·</span>{" "}
                      {displayOrEmpty(companyReport.business_analysis.current_focus)}
                    </p>
                    <p className="border-t border-line-soft pt-2.5">
                      <span className="font-medium">미래·사업 방향 ·</span>{" "}
                      {displayOrEmpty(companyReport.business_analysis.future_direction)}
                    </p>
                    <p className="border-t border-line-soft pt-2.5 text-muted">
                      <span className="font-medium text-ink">최근 뉴스 ·</span>{" "}
                      {displayOrEmpty(companyReport.business_analysis.recent_news)}
                    </p>
                    <p className="border-t border-line-soft pt-2.5 text-muted">
                      <span className="font-medium text-ink">재무 현황 ·</span>{" "}
                      {displayOrEmpty(companyReport.business_analysis.financials)}
                    </p>
                    <p className="border-t border-line-soft pt-2.5 text-muted">
                      <span className="font-medium text-ink">주요 채용 직무 ·</span>{" "}
                      {companyReport.business_analysis.org_roles.join(", ") || "제공된 자료에서 확인 불가"}
                    </p>
                  </div>
                </div>
                <div className="rounded-[12px] border border-line">
                  <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                    환경분석 · SWOT
                  </div>
                  <div className="grid grid-cols-2 text-sm">
                    <div className="border-r border-b border-line-soft p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-deepgreen">STRENGTH</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.swot.strengths)}
                      </p>
                    </div>
                    <div className="border-b border-line-soft p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-alert">WEAKNESS</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.swot.weaknesses)}
                      </p>
                    </div>
                    <div className="border-r border-line-soft p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-deepgreen">OPPORTUNITY</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.swot.opportunities)}
                      </p>
                    </div>
                    <div className="p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-alert">THREAT</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.swot.threats)}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-line-soft p-3.5 text-sm leading-relaxed">
                    <span className="font-medium">산업 트렌드 ·</span>{" "}
                    {displayOrEmpty(companyReport.environment_analysis.industry_trends)}
                    <br />
                    <span className="font-medium">경쟁사 ·</span>{" "}
                    {displayOrEmpty(companyReport.environment_analysis.competitors)}
                  </div>
                </div>
                <div className="rounded-[12px] border border-line">
                  <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                    환경분석 · PEST
                  </div>
                  <div className="grid grid-cols-2 text-sm">
                    <div className="border-r border-b border-line-soft p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-muted">POLITICAL</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.pest.political)}
                      </p>
                    </div>
                    <div className="border-b border-line-soft p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-muted">ECONOMIC</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.pest.economic)}
                      </p>
                    </div>
                    <div className="border-r border-line-soft p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-muted">SOCIAL</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.pest.social)}
                      </p>
                    </div>
                    <div className="p-3.5">
                      <p className="font-outfit mb-1.5 text-xs text-muted">TECHNOLOGICAL</p>
                      <p className="leading-relaxed">
                        {displayOrEmpty(companyReport.environment_analysis.pest.technological)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[12px] border border-line">
                  <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                    환경분석 · SWOT 전략 (TOWS)
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-5 p-4 text-sm">
                    <div>
                      <p className="font-outfit text-xs text-deepgreen">SO — 강점으로 기회 잡기</p>
                      <StrategyBulletList items={companyReport.environment_analysis.swot_strategies.so} />
                    </div>
                    <div>
                      <p className="font-outfit text-xs text-deepgreen">WO — 약점 보완해 기회 잡기</p>
                      <StrategyBulletList items={companyReport.environment_analysis.swot_strategies.wo} />
                    </div>
                    <div>
                      <p className="font-outfit text-xs text-alert">ST — 강점으로 위협 방어</p>
                      <StrategyBulletList items={companyReport.environment_analysis.swot_strategies.st} />
                    </div>
                    <div>
                      <p className="font-outfit text-xs text-alert">WT — 약점·위협 리스크 최소화</p>
                      <StrategyBulletList items={companyReport.environment_analysis.swot_strategies.wt} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[12px] border border-line">
                <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
                  <span className="text-base font-semibold">직무 이해</span>
                  <span className="text-[13px] text-muted">
                    {roleOfInterest.trim() ? `${roleOfInterest} 기준` : "회사 전반"} · 같은 직무명도 회사마다 다름
                  </span>
                </div>
                <div className="flex flex-col gap-3 p-4 text-sm leading-relaxed">
                  <p>
                    <span className="font-medium">이 회사에서의 업무 성격 ·</span>{" "}
                    {displayOrEmpty(companyReport.role_understanding.core_work_type)}
                  </p>
                  <p className="border-t border-line-soft pt-3">
                    <span className="font-medium">타사 동일 직무와의 차이 ·</span>{" "}
                    {displayOrEmpty(companyReport.role_understanding.differs_from_peers)}
                  </p>
                  <div className="border-t border-line-soft pt-3">
                    <span className="font-medium">필요 역량</span>
                    <PlainBulletList items={companyReport.role_understanding.required_capabilities} />
                  </div>
                  <div className="rounded-[10px] border border-limewash-line bg-limewash p-3">
                    <span className="font-medium text-deepgreen">비즈니스 적응 근거</span>{" "}
                    <span className="text-[13px] text-muted">— 자소서에 인용할 회사 쪽 사실</span>
                    <PlainBulletList items={companyReport.role_understanding.business_fit_points} />
                  </div>
                  <p className="border-t border-line-soft pt-3 text-muted">
                    <span className="font-medium text-ink">하루 일과 ·</span>{" "}
                    {displayOrEmpty(companyReport.role_understanding.daily_work)}
                  </p>
                  <p className="border-t border-line-soft pt-3 text-muted">
                    <span className="font-medium text-ink">3·5·7년 뒤 업무 범위 변화 ·</span>{" "}
                    {displayOrEmpty(companyReport.role_understanding.growth_path)}
                  </p>
                  <p className="border-t border-line-soft pt-3 text-muted">
                    <span className="font-medium text-ink">비정기 이슈 실무 대응 ·</span>{" "}
                    {displayOrEmpty(companyReport.role_understanding.irregular_issues)}
                  </p>
                </div>
              </div>

              <div className="rounded-[12px] border border-line">
                <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
                  <span className="text-base font-semibold">채용전략 · 준비 로드맵</span>
                  {roleOfInterest.trim() && (
                    <span className="text-[13px] text-muted">{roleOfInterest} 기준</span>
                  )}
                </div>
                <div className="p-4 text-sm leading-relaxed">
                  <p className="mb-2">
                    <span className="font-medium">최근 채용공고 ·</span>{" "}
                    {companyReport.job_strategy.recent_postings.length === 0
                      ? "제공된 자료에서 확인 불가"
                      : companyReport.job_strategy.recent_postings
                          .map((p) => p.title)
                          .join(", ")}
                  </p>
                  {companyReport.job_strategy.aggregated_stacks.length > 0 && (
                    <div className="mb-2">
                      <span className="font-medium">최근 채용 스택</span>{" "}
                      <span className="text-muted">(매칭 시 우대 스택에 반영됨)</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {companyReport.job_strategy.aggregated_stacks.map((stack) => (
                          <span
                            key={stack.raw}
                            className="rounded-[6px] border border-line px-2.5 py-1 text-[13px]"
                          >
                            {stack.raw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="font-medium">준비 로드맵</span>
                    <StrategyBulletList items={companyReport.job_strategy.roadmap} />
                  </div>
                  {companyReport.job_strategy.self_research_guide.length > 0 && (
                    <div className="mt-3 border-t border-line-soft pt-3">
                      <span className="font-medium">직접 알아볼 것</span>{" "}
                      <span className="text-[13px] text-muted">— 회사 자료에 없어 직접 조사가 필요한 항목</span>
                      <StrategyBulletList items={companyReport.job_strategy.self_research_guide} />
                    </div>
                  )}
                </div>
              </div>

              {companyReport.sources.length > 0 && (
                <div className="rounded-[12px] border border-line">
                  <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                    출처 {companyReport.sources.length}
                  </div>
                  <div className="flex flex-col px-4">
                    {companyReport.sources.map((source, i) => (
                      <a
                        key={i}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex gap-3 border-b border-line-soft py-2.5 text-sm last:border-b-0 hover:underline"
                      >
                        <span className="font-outfit text-muted">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 text-ink">{source.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {companyReport && (
            <button
              type="button"
              onClick={() => setView("matching")}
              className="self-start rounded-[9px] border border-lime bg-lime px-5 py-2.5 text-base font-semibold text-ink transition hover:brightness-95"
            >
              다음: 공고·이력서 입력하기 →
            </button>
          )}
          </div>
          )}

          {view === "matching" && (
          <div className="flex flex-col gap-5">
          <button
            type="button"
            onClick={() => setView("company")}
            className="self-start text-sm text-muted underline"
          >
            ← 기업분석으로 돌아가기
          </button>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line bg-surface-alt px-3 py-2 text-[13px] text-muted">
            <span>
              URL 가져오기가 안 되는 사이트라면, 이 버튼을 즐겨찾기에 드래그해 두세요 — 공고
              페이지에서 클릭하면 화면에 보이는 텍스트가 복사됩니다.
            </span>
            <a
              ref={bookmarkletRef}
              onClick={(e) => e.preventDefault()}
              className="inline-block shrink-0 cursor-move rounded-[7px] bg-ink px-3 py-1.5 text-[13px] font-medium text-white"
            >
              텍스트 긁어오기
            </a>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="font-outfit text-2xl font-bold uppercase tracking-[.02em] text-deepgreen">
                STEP 01 — 채용공고
              </span>
              {jdText.trim() && !isJdUrl && (
                <span className="text-[13px] font-semibold text-deepgreen">입력 완료</span>
              )}
            </div>
            <textarea
              id="jd"
              value={jdText}
              onChange={(e) => {
                setJdText(e.target.value);
                setFetchError(null);
              }}
              disabled={isFetchingUrl}
              placeholder="공고 본문을 붙여넣거나 공고 URL을 넣어주세요"
              className="min-h-32 rounded-[9px] border border-line p-3 text-base leading-relaxed outline-none transition focus:border-deepgreen disabled:bg-surface-alt disabled:text-muted"
            />
            {isJdUrl && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleFetchUrl}
                  disabled={isFetchingUrl}
                  className="self-start rounded-[9px] border border-lime bg-lime px-4 py-2 text-base font-semibold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-line disabled:bg-disabled-bg disabled:text-disabled-text"
                >
                  {isFetchingUrl ? "가져오는 중..." : "URL에서 가져오기"}
                </button>
                {fetchError && (
                  <div className="flex flex-col gap-2 rounded-[9px] border border-alertwash-line bg-alertwash p-3.5">
                    <p className="text-sm font-semibold text-alert">
                      이 URL에서 공고를 가져오지 못했습니다
                    </p>
                    <p className="text-sm leading-relaxed">{fetchError}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleFetchUrl}
                        className="rounded-[8px] border border-lime bg-lime px-3 py-1.5 text-[13px] font-semibold text-ink"
                      >
                        다시 시도
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setJdText("");
                          setFetchError(null);
                        }}
                        className="rounded-[8px] border border-line bg-white px-3 py-1.5 text-[13px] font-medium"
                      >
                        직접 붙여넣기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="font-outfit text-2xl font-bold uppercase tracking-[.02em] text-deepgreen">
                STEP 02 — 이력서
              </span>
              {(resumeFile || resumeText.trim()) && (
                <span className="text-[13px] font-semibold text-deepgreen">
                  {resumeFile ? "파일 추출 완료" : "입력 완료"}
                </span>
              )}
            </div>
            {resumeFile ? (
              <div className="flex items-center justify-between rounded-[8px] border border-line bg-surface-alt p-3">
                <span className="text-sm font-medium">{resumeFile.name}</span>
                <button type="button" onClick={handleRemoveFile} className="text-sm text-muted underline">
                  교체
                </button>
              </div>
            ) : (
              <textarea
                id="resume"
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value);
                  setResumeFileError(null);
                }}
                placeholder="이력서 텍스트를 붙여넣거나 아래에서 파일을 첨부하세요"
                className="min-h-32 rounded-[9px] border border-line p-3 text-base leading-relaxed outline-none transition focus:border-deepgreen"
              />
            )}
            <input
              type="file"
              accept=".pdf,.docx,.html,.htm,.hwp"
              onChange={handleFileChange}
              className="text-sm text-muted file:mr-3 file:rounded-[8px] file:border file:border-line file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-ink"
            />
            <p className="text-[13px] text-muted">PDF · DOCX · HTML · 최대 3MB (HWP 미지원)</p>
            {resumeFileError && (
              <div className="rounded-[9px] border border-alertwash-line bg-alertwash p-3.5">
                <p className="text-sm font-semibold text-alert">파일을 읽을 수 없습니다</p>
                <p className="mt-1 text-sm leading-relaxed">{resumeFileError}</p>
              </div>
            )}
          </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="font-outfit text-2xl font-bold uppercase tracking-[.02em] text-deepgreen">
                STEP 03 — 자소서 · 포트폴리오
              </span>
              <span className="text-[13px] text-muted">선택 · 넣으면 함께 재구성됩니다</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="coverLetter" className="text-sm font-medium">
                  자소서
                </label>
                {coverLetterFile ? (
                  <div className="flex items-center justify-between rounded-[8px] border border-line bg-surface-alt p-3">
                    <span className="text-sm font-medium">{coverLetterFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setCoverLetterFile(null)}
                      className="text-sm text-muted underline"
                    >
                      교체
                    </button>
                  </div>
                ) : (
                  <textarea
                    id="coverLetter"
                    value={coverLetterText}
                    onChange={(e) => setCoverLetterText(e.target.value)}
                    placeholder="자소서 텍스트를 붙여넣거나 아래에서 파일을 첨부하세요 (넣으면 재구성 제안에 함께 포함됩니다)"
                    className="min-h-24 rounded-[9px] border border-line p-3 text-base leading-relaxed outline-none transition focus:border-deepgreen"
                  />
                )}
                <input
                  type="file"
                  accept=".pdf,.docx,.html,.htm,.hwp"
                  onChange={handleCoverLetterFileChange}
                  className="text-sm text-muted file:mr-3 file:rounded-[8px] file:border file:border-line file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-ink"
                />
                <p className="text-[13px] text-muted">PDF · DOCX · HTML · 최대 3MB (HWP 미지원)</p>
                {coverLetterFileError && (
                  <div className="rounded-[9px] border border-alertwash-line bg-alertwash p-3.5">
                    <p className="text-sm font-semibold text-alert">파일을 읽을 수 없습니다</p>
                    <p className="mt-1 text-sm leading-relaxed">{coverLetterFileError}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="portfolio" className="text-sm font-medium">
                  포트폴리오
                </label>
                {portfolioFile ? (
                  <div className="flex items-center justify-between rounded-[8px] border border-line bg-surface-alt p-3">
                    <span className="text-sm font-medium">{portfolioFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setPortfolioFile(null)}
                      className="text-sm text-muted underline"
                    >
                      교체
                    </button>
                  </div>
                ) : (
                  <textarea
                    id="portfolio"
                    value={portfolioText}
                    onChange={(e) => setPortfolioText(e.target.value)}
                    placeholder="프로젝트 목록 등을 붙여넣거나 아래에서 파일을 첨부하세요 (넣으면 우선순위 재정렬 제안도 포함됩니다)"
                    className="min-h-24 rounded-[9px] border border-line p-3 text-base leading-relaxed outline-none transition focus:border-deepgreen"
                  />
                )}
                <input
                  type="file"
                  accept=".pdf,.docx,.html,.htm,.hwp"
                  onChange={handlePortfolioFileChange}
                  className="text-sm text-muted file:mr-3 file:rounded-[8px] file:border file:border-line file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-ink"
                />
                <p className="text-[13px] text-muted">PDF · DOCX · HTML · 최대 3MB (HWP 미지원)</p>
                {portfolioFileError && (
                  <div className="rounded-[9px] border border-alertwash-line bg-alertwash p-3.5">
                    <p className="text-sm font-semibold text-alert">파일을 읽을 수 없습니다</p>
                    <p className="mt-1 text-sm leading-relaxed">{portfolioFileError}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted">
              {isJdUrl ? (
                <span>공고 URL을 아직 가져오지 않았습니다.</span>
              ) : isEmpty ? (
                <span>공고와 이력서를 모두 입력해 주세요.</span>
              ) : !companyReport ? (
                <span>매칭 결과는 기업분석을 먼저 완료해야 확인할 수 있습니다.</span>
              ) : isMatching ? (
                <span className="inline-flex items-center gap-2 font-medium text-deepgreen">
                  매칭 분석 중입니다 — 완료되면 아래에 결과가 표시됩니다
                  <LoadingDots />
                </span>
              ) : (
                <span>공고·이력서·기업분석 확인됨 · 분석에 약 30초</span>
              )}
            </div>
            <button
              type="submit"
              disabled={isBlocked || isMatching}
              className="inline-flex items-center justify-center gap-2 rounded-[9px] border border-lime bg-lime px-6 py-3 text-base font-semibold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-line disabled:bg-disabled-bg disabled:text-disabled-text disabled:hover:brightness-100"
            >
              {isMatching ? "매칭 분석 중..." : matchResult ? "매칭 결과 다시 분석" : "매칭 결과 보기"}
            </button>
          </div>
          </div>
          )}
        </form>

        <button
          type="button"
          onClick={handleReset}
          className="self-start text-sm text-muted underline"
        >
          초기화
        </button>

        {view === "matching" && (
        <>
        {savedEntry && (
          <div className="rounded-xl border border-limewash-line bg-limewash p-5 text-base">
            <p className="mb-2 text-[13px] font-medium text-deepgreen">
              저장됨 · {savedEntry.savedAt}
            </p>
            <p>
              <span className="font-semibold">공고:</span>{" "}
              {savedEntry.jdText.slice(0, 30)}
            </p>
            <p>
              <span className="font-semibold">이력서:</span>{" "}
              {savedEntry.resumeFile
                ? savedEntry.resumeFile.name
                : savedEntry.resumeText.slice(0, 30)}
            </p>
            {(savedEntry.coverLetterFile || savedEntry.coverLetterText) && (
              <p>
                <span className="font-semibold">자소서:</span>{" "}
                {savedEntry.coverLetterFile
                  ? savedEntry.coverLetterFile.name
                  : savedEntry.coverLetterText.slice(0, 30)}
              </p>
            )}
            {(savedEntry.portfolioFile || savedEntry.portfolioText) && (
              <p>
                <span className="font-semibold">포트폴리오:</span>{" "}
                {savedEntry.portfolioFile
                  ? savedEntry.portfolioFile.name
                  : savedEntry.portfolioText.slice(0, 30)}
              </p>
            )}
          </div>
        )}

        {parseJobError && (
          <ErrorCard
            message={parseJobError}
            onRetry={() => runParseJob(jdText)}
          />
        )}
        {(isParsingJob || parsedJob) && !parseJobError && (
          <div className="rounded-xl border border-line bg-white p-5 text-base">
            <p className="mb-2 text-[13px] font-medium text-muted">
              공고 분석 결과 (디버그용 — 매칭 점수/gap은 아래 결과 카드 참고)
            </p>
            {isParsingJob && <p className="text-muted">분석 중...</p>}
            {parsedJob && (
              <pre className="overflow-x-auto rounded-[8px] bg-surface-alt p-3 text-[13px] whitespace-pre-wrap break-words">
                {JSON.stringify(parsedJob, null, 2)}
              </pre>
            )}
          </div>
        )}

        {parsedJob && companyReport && companySourceTexts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5 text-base">
            <p className="text-sm text-muted">
              {companyReport.job_strategy.personalized
                ? "이 공고 요구 스택에 맞춘 채용전략 로드맵이 반영되어 있습니다."
                : "지금 기업분석 로드맵은 공고 내용을 반영하기 전입니다. 이 공고의 요구 스택에 맞춰 다시 받을 수 있어요."}
            </p>
            <button
              type="button"
              onClick={handlePersonalizeCompany}
              disabled={isPersonalizingCompany}
              className="inline-flex items-center gap-2 self-start rounded-[9px] border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-deepgreen disabled:cursor-not-allowed disabled:text-disabled-text"
            >
              {isPersonalizingCompany ? (
                <>
                  재분석 중 <LoadingDots />
                </>
              ) : (
                "이 공고에 맞춰 기업분석 다시보기"
              )}
            </button>
          </div>
        )}

        {parseApplicantError && (
          <ErrorCard
            message={parseApplicantError}
            onRetry={() => runParseApplicant(resumeText, resumeFile)}
          />
        )}
        {(isParsingApplicant || parsedApplicant) && !parseApplicantError && (
          <div className="rounded-xl border border-line bg-white p-5 text-base">
            <p className="mb-2 text-[13px] font-medium text-muted">이력서 분석 결과 (디버그용)</p>
            {isParsingApplicant && <p className="text-muted">분석 중...</p>}
            {parsedApplicant && (
              <pre className="overflow-x-auto rounded-[8px] bg-surface-alt p-3 text-[13px] whitespace-pre-wrap break-words">
                {JSON.stringify(parsedApplicant, null, 2)}
              </pre>
            )}
          </div>
        )}

        {judgeError && (
          <ErrorCard
            message={judgeError}
            onRetry={() => {
              if (parsedJob) runJudgeJob(jdText, parsedJob);
            }}
          />
        )}
        {(isJudgingJob || judgeResult) && !judgeError && (
          <div className="rounded-xl border border-line bg-white p-5 text-base">
            <p className="mb-2 text-[13px] font-medium text-muted">판단 지점 에이전트 결과 (디버그용)</p>
            {isJudgingJob && <p className="text-muted">분석 중...</p>}
            {judgeResult && (
              <pre className="overflow-x-auto rounded-[8px] bg-surface-alt p-3 text-[13px] whitespace-pre-wrap break-words">
                {JSON.stringify(judgeResult, null, 2)}
              </pre>
            )}
          </div>
        )}

        {matchResult && parsedJob && parsedApplicant && (
          <div className="flex flex-col gap-5 rounded-xl border border-line bg-white p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3.5 rounded-[14px] bg-gradient-to-br from-deepgreen to-deepgreen-dark p-6 text-white">
                <span className="font-outfit text-xs uppercase tracking-[.16em] text-white/70">
                  Match Score
                </span>
                <div className="flex items-end gap-3">
                  <span className="font-outfit text-6xl leading-none font-bold text-lime">
                    {matchResult.score}
                  </span>
                  <span className="pb-2 text-[15px] text-white/80">/ 100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full bg-lime"
                    style={{ width: `${Math.min(matchResult.score, 100)}%` }}
                  />
                </div>
                <p className="text-sm leading-relaxed text-white/80">
                  100점에서 시작해 부족한 스택마다 감점됩니다 (하드 룰 기반 계산이라 같은
                  입력이면 항상 같은 점수).
                </p>
                {matchResult.deductions.length > 0 && (
                  <div className="flex flex-col gap-1.5 border-t border-white/15 pt-3.5 text-sm">
                    <p className="text-white/60">감점 내역</p>
                    <ul className="flex flex-col gap-1">
                      {matchResult.deductions.map((d) => (
                        <li key={d.raw} className="flex items-center justify-between gap-3">
                          <span className="truncate">
                            {d.raw}{" "}
                            <span className="text-white/50">
                              ({d.category === "required" ? "필수" : "우대"})
                            </span>
                          </span>
                          <span className="font-outfit shrink-0 font-semibold text-lime">
                            -{d.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-4 border-t border-white/15 pt-3.5 text-sm">
                  <div className="flex-1">
                    <p className="mb-0.5 text-white/60">제출 방법</p>
                    <p className="font-medium">
                      {SUBMISSION_METHOD_LABELS[parsedJob.submission_method]}
                    </p>
                  </div>
                  <div className="flex-1">
                    <p className="mb-0.5 text-white/60">필요 서류</p>
                    <p className="font-medium">
                      {parsedJob.required_documents.length > 0
                        ? parsedJob.required_documents.join(", ")
                        : "명시된 서류 없음"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-[14px] border border-line p-6">
                <span className="font-outfit text-xs uppercase tracking-[.14em] text-muted">
                  스택 대조
                </span>
                <div>
                  <p className="mb-1.5 text-[13px] text-muted">
                    보유 · {parsedApplicant.stacks.length}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedApplicant.stacks.map((stack) => (
                      <span
                        key={stack.raw}
                        className="rounded-[6px] border border-limewash-line bg-limewash px-2.5 py-1 text-[13px] text-deepgreen"
                      >
                        {stack.raw}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mt-1.5 mb-1.5 text-[13px] text-muted">
                    부족 · {matchResult.gap_stacks.length}
                  </p>
                  {matchResult.gap_stacks.length === 0 ? (
                    <p className="text-base text-muted">부족한 스택 없음</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {matchResult.gap_stacks.map((stack) => (
                        <span
                          key={stack}
                          className="rounded-[6px] border border-alertwash-line bg-alertwash px-2.5 py-1 text-[13px] text-alert"
                        >
                          {stack}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted">
                {matchResult.gap_stacks.length > 0
                  ? `부족한 ${matchResult.gap_stacks.length}개를 반영해 문서를 다시 쓰면 점수가 올라갑니다`
                  : "요구 스택을 모두 충족했습니다"}
              </span>
              {!suggestionResult && (
                <button
                  type="button"
                  onClick={() =>
                    runSuggestResume(matchResult.gap_stacks, [
                      ...parsedJob.required_stacks.map((s) => s.raw),
                      ...parsedJob.preferred_stacks.map((s) => s.raw),
                    ])
                  }
                  disabled={isSuggestingResume}
                  className="shrink-0 rounded-[9px] border border-lime bg-lime px-5 py-2.5 text-base font-semibold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-line disabled:bg-disabled-bg disabled:text-disabled-text"
                >
                  {isSuggestingResume ? "재구성 제안 생성 중..." : "이력서 재구성 제안 보기"}
                </button>
              )}
            </div>
          </div>
        )}

        {suggestionError && (
          <ErrorCard
            message={suggestionError}
            onRetry={() => {
              if (matchResult && parsedJob) {
                runSuggestResume(matchResult.gap_stacks, [
                  ...parsedJob.required_stacks.map((s) => s.raw),
                  ...parsedJob.preferred_stacks.map((s) => s.raw),
                ]);
              }
            }}
          />
        )}

        {suggestionResult && improvedMatch && potentialMatch && matchResult && (
          <div className="flex flex-col gap-5 rounded-xl border border-line bg-white p-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                재구성<span className="text-ghost"> 제안</span>
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                부족 스택 {matchResult.gap_stacks.length}개와 공고 키워드를 반영해 문서를 다시
                썼습니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-8 rounded-[12px] border border-line p-5">
              <div>
                <p className="mb-1 text-[13px] text-muted">원본</p>
                <p className="font-outfit text-3xl font-bold text-muted">{matchResult.score}</p>
              </div>
              <div>
                <p className="mb-1 text-[13px] text-muted">개선 후</p>
                <p className={`font-outfit text-3xl font-bold ${SCORE_COLOR_CLASS}`}>
                  {improvedMatch.score}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[13px] text-muted">잠재 최대</p>
                <p className="font-outfit text-3xl font-bold text-ink">{potentialMatch.score}</p>
              </div>
            </div>

            <div className="rounded-[12px] border border-line">
              <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                이력서 재구성문
              </div>
              <pre className="overflow-x-auto p-4 text-base leading-relaxed whitespace-pre-wrap break-words">
                {suggestionResult.resume_suggestion}
              </pre>
            </div>

            {(coverLetterText.trim() || coverLetterFile) && suggestionResult.cover_letter_suggestion.trim() && (
              <div className="rounded-[12px] border border-line">
                <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                  자소서 재구성문
                </div>
                <pre className="overflow-x-auto p-4 text-base leading-relaxed whitespace-pre-wrap break-words">
                  {suggestionResult.cover_letter_suggestion}
                </pre>
              </div>
            )}

            {(coverLetterText.trim() || coverLetterFile) && suggestionResult.narrative_gaps.length > 0 && (
              <div className="rounded-[12px] border border-line">
                <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                  스토리텔링 보완 포인트
                  <span className="ml-2 text-[13px] font-normal text-muted">
                    &ldquo;왜&rdquo; 그런 선택을 했는지, 그 안에서 어떤 사람이었는지를 직접 채워보세요
                  </span>
                </div>
                <ul className="flex flex-col gap-2.5 p-4">
                  {suggestionResult.narrative_gaps.map((gap, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="font-outfit text-deepgreen">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{gap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(portfolioText.trim() || portfolioFile) && suggestionResult.portfolio_suggestion.trim() && (
              <div className="rounded-[12px] border border-line">
                <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                  포트폴리오 재구성문
                </div>
                <pre className="overflow-x-auto p-4 text-base leading-relaxed whitespace-pre-wrap break-words">
                  {suggestionResult.portfolio_suggestion}
                </pre>
              </div>
            )}

            <div className="rounded-[12px] border border-line">
              <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                개선 제안서
              </div>
              {!improvementSuggestions || improvementSuggestions.length === 0 ? (
                <p className="p-4 text-base text-muted">개선 제안 없음</p>
              ) : (
                <ul className="flex flex-col gap-2.5 p-4">
                  {improvementSuggestions.map((stack, i) => (
                    <li key={stack} className="flex gap-3 text-sm leading-relaxed">
                      <span className="font-outfit text-deepgreen">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="font-semibold">{stack}</span> — 보유 여부는 사용자가
                        직접 판단
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-[12px] border border-line">
              <div className="border-b border-line-soft px-4 py-3 text-base font-semibold">
                면접 꼬리질문 {suggestionResult.interview_questions.length}
              </div>
              <ol className="flex flex-col gap-3 p-4">
                {suggestionResult.interview_questions.map((question, i) => (
                  <li
                    key={i}
                    className={i > 0 ? "border-t border-line-soft pt-3 text-sm leading-relaxed" : "text-sm leading-relaxed"}
                  >
                    <span className="font-outfit mb-1 block text-xs text-muted">
                      Q{i + 1}
                    </span>
                    {question}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
