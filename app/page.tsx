"use client";

import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { calculateMatch } from "@/lib/calculate-match";

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

interface ResumeFile {
  name: string;
  type: string;
  dataBase64: string;
}

interface SavedEntry {
  jdText: string;
  resumeText: string;
  resumeFile: ResumeFile | null;
  savedAt: string;
}

interface CanonicalizedStack {
  raw: string;
  canonical: string | null;
  registered: boolean;
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
  confirmed_gap_stacks: string[];
  interview_questions: string[];
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

function base64ToFile(resumeFile: ResumeFile): File {
  const bytes = atob(resumeFile.dataBase64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new File([array], resumeFile.name, { type: resumeFile.type });
}

async function extractResumeFileText(resumeFile: ResumeFile): Promise<string> {
  const formData = new FormData();
  formData.append("file", base64ToFile(resumeFile));
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

function scoreColorClass(score: number): string {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

// PDF는 Gemini가 파일을 직접 읽고 구조화까지 한 번에 하므로(parse-applicant),
// 텍스트만 따로 추출하는 /api/parse-resume 호출(무료 티어 일일 호출 소모)을
// 건너뛴다. DOCX/HTML은 추출 자체가 로컬 라이브러리(mammoth/cheerio)라 무료라
// 합칠 이유가 없어 기존 방식(추출 후 구조화, 2단계) 유지
function isPdfFile(resumeFile: ResumeFile): boolean {
  return (
    resumeFile.type === "application/pdf" ||
    resumeFile.name.toLowerCase().endsWith(".pdf")
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-sm">
      <p className="mb-3">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-700"
      >
        다시 시도
      </button>
    </div>
  );
}

export default function Home() {
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<ResumeFile | null>(null);
  const [savedEntry, setSavedEntry] = useState<SavedEntry | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
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
  const isJdUrl = URL_ONLY_PATTERN.test(jdText.trim());
  const isEmpty = !jdText.trim() || (!resumeText.trim() && !resumeFile);
  const isBlocked = isJdUrl || isEmpty;
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  // API 키가 필요 없는 순수 계산이라 서버로 보내지 않고 클라이언트에서 바로
  // 계산한다 (불필요한 네트워크 왕복 없음)
  const matchResult = useMemo(() => {
    if (!parsedJob || !parsedApplicant) return null;
    return calculateMatch(
      parsedJob.required_stacks,
      parsedJob.preferred_stacks,
      parsedApplicant.stacks
    );
  }, [parsedJob, parsedApplicant]);

  // 재구성 제안이 "새로 찾아낸" 스택(confirmed_gap_stacks)은 원본에 이미 있었지만
  // 05가 처음에 놓친 것뿐이라, 원본 required/preferred 목록에서 같은 raw 이름의
  // CanonicalizedStack을 그대로 가져와 합친다 — 새로 캐노니컬라이즈하지 않음
  // (08의 calculateMatch는 여전히 순수 함수 그대로 재사용, 하드 룰 4번 유지)
  const improvedMatch = useMemo(() => {
    if (!parsedJob || !parsedApplicant || !suggestionResult) return null;
    const allJobStacks = [...parsedJob.required_stacks, ...parsedJob.preferred_stacks];
    const confirmedStacks = suggestionResult.confirmed_gap_stacks
      .map((raw) => allJobStacks.find((stack) => stack.raw === raw))
      .filter((stack): stack is CanonicalizedStack => stack !== undefined);
    return calculateMatch(parsedJob.required_stacks, parsedJob.preferred_stacks, [
      ...parsedApplicant.stacks,
      ...confirmedStacks,
    ]);
  }, [parsedJob, parsedApplicant, suggestionResult]);

  // 잠재 최대 점수: confirmed 여부와 무관하게 matchResult의 gap_stacks(최대 3개)를
  // 전부 채웠다고 가정 — improvedMatch와 같은 병합 패턴, 대상만 다르다
  const potentialMatch = useMemo(() => {
    if (!parsedJob || !parsedApplicant || !matchResult || !suggestionResult) return null;
    const allJobStacks = [...parsedJob.required_stacks, ...parsedJob.preferred_stacks];
    const allGapStacks = matchResult.gap_stacks
      .map((raw) => allJobStacks.find((stack) => stack.raw === raw))
      .filter((stack): stack is CanonicalizedStack => stack !== undefined);
    return calculateMatch(parsedJob.required_stacks, parsedJob.preferred_stacks, [
      ...parsedApplicant.stacks,
      ...allGapStacks,
    ]);
  }, [parsedJob, parsedApplicant, matchResult, suggestionResult]);

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 다시 발생하도록
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".hwp")) {
      setFileError("HWP는 아직 지원하지 않습니다. 텍스트로 복사해서 붙여넣어 주세요.");
      return;
    }
    if (file.size > MAX_RESUME_FILE_SIZE) {
      setFileError("파일이 너무 큽니다 (3MB 이하만 가능합니다). 텍스트로 복사해서 붙여넣어 주세요.");
      return;
    }

    setFileError(null);
    const dataBase64 = await fileToBase64(file);
    setResumeFile({ name: file.name, type: file.type, dataBase64 });
    setResumeText("");
  }

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

  async function runParseApplicant(text: string, file: ResumeFile | null) {
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
        const resolvedText = file ? await extractResumeFileText(file) : text;
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
      const res = await fetch("/api/suggest-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...applicantInput, gapStacks, jobStacks }),
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

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const entry: SavedEntry = {
      jdText,
      resumeText,
      resumeFile,
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
    setSavedEntry(null);
    setFetchError(null);
    setFileError(null);
    setParsedJob(null);
    setParseJobError(null);
    setParsedApplicant(null);
    setParseApplicantError(null);
    setJudgeResult(null);
    setJudgeError(null);
    setApplicantInput(null);
    setSuggestionResult(null);
    setSuggestionError(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            GlobalFit
          </span>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            국내/해외 채용공고-이력서 핏 분석기
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8"
        >
          <div className="flex flex-col gap-2">
            <label
              htmlFor="jd"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              공고
            </label>
            <textarea
              id="jd"
              value={jdText}
              onChange={(e) => {
                setJdText(e.target.value);
                setFetchError(null);
              }}
              placeholder="공고 텍스트 또는 공고 URL"
              className="min-h-32 rounded-xl border border-gray-200 p-3.5 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            {isJdUrl && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleFetchUrl}
                  disabled={isFetchingUrl}
                  className="self-start rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isFetchingUrl ? "가져오는 중..." : "URL에서 가져오기"}
                </button>
                {fetchError && (
                  <p className="text-sm text-red-600">{fetchError}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="resume"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              이력서
            </label>
            {resumeFile ? (
              <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3.5 text-sm text-indigo-900">
                <span>📎 {resumeFile.name}</span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="text-indigo-500 underline hover:text-indigo-700"
                >
                  제거
                </button>
              </div>
            ) : (
              <textarea
                id="resume"
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value);
                  setFileError(null);
                }}
                placeholder="이력서 텍스트 (또는 아래에서 파일 첨부)"
                className="min-h-32 rounded-xl border border-gray-200 p-3.5 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            )}
            <input
              type="file"
              accept=".pdf,.docx,.html,.htm,.hwp"
              onChange={handleFileChange}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
            {fileError && <p className="text-sm text-red-600">{fileError}</p>}
          </div>

          {!isJdUrl && isEmpty && (
            <p className="text-sm text-red-600">
              공고와 이력서를 모두 입력해 주세요.
            </p>
          )}

          <button
            type="submit"
            disabled={isBlocked}
            className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            제출
          </button>
        </form>

        <button
          type="button"
          onClick={handleReset}
          className="self-start text-sm text-gray-400 underline hover:text-gray-600"
        >
          초기화
        </button>

        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-100/60 p-5 text-sm text-gray-600">
          <p className="mb-1 font-semibold text-gray-800">
            URL 가져오기가 안 되는 사이트라면?
          </p>
          <p className="mb-3">
            아래 버튼을 즐겨찾기 바로 드래그해 두세요. 공고 페이지에서 클릭하면
            화면에 보이는 텍스트가 복사됩니다 — 서버가 아니라 지금 보고 계신
            브라우저에서 직접 긁어오는 방식이라 차단되는 사이트에서도 동작해요.
          </p>
          <a
            ref={bookmarkletRef}
            onClick={(e) => e.preventDefault()}
            className="inline-block cursor-move rounded-lg bg-gray-800 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-900"
          >
            📌 텍스트 긁어오기
          </a>
        </div>

        {savedEntry && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-900">
            <p className="mb-2 text-xs font-medium text-emerald-600">
              ✓ 저장됨 · {savedEntry.savedAt}
            </p>
            <p>
              <span className="font-semibold">공고:</span>{" "}
              {savedEntry.jdText.slice(0, 30)}
            </p>
            <p>
              <span className="font-semibold">이력서:</span>{" "}
              {savedEntry.resumeFile
                ? `📎 ${savedEntry.resumeFile.name}`
                : savedEntry.resumeText.slice(0, 30)}
            </p>
          </div>
        )}

        {parseJobError && (
          <ErrorCard
            message={parseJobError}
            onRetry={() => runParseJob(jdText)}
          />
        )}
        {(isParsingJob || parsedJob) && !parseJobError && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-800 shadow-sm">
            <p className="mb-2 text-xs font-medium text-gray-400">
              공고 분석 결과 (디버그용 — 매칭 점수/gap은 아래 결과 카드 참고)
            </p>
            {isParsingJob && <p className="text-gray-500">분석 중...</p>}
            {parsedJob && (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-700">
                {JSON.stringify(parsedJob, null, 2)}
              </pre>
            )}
          </div>
        )}

        {parseApplicantError && (
          <ErrorCard
            message={parseApplicantError}
            onRetry={() => runParseApplicant(resumeText, resumeFile)}
          />
        )}
        {(isParsingApplicant || parsedApplicant) && !parseApplicantError && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-800 shadow-sm">
            <p className="mb-2 text-xs font-medium text-gray-400">
              이력서 분석 결과 (디버그용)
            </p>
            {isParsingApplicant && <p className="text-gray-500">분석 중...</p>}
            {parsedApplicant && (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-700">
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
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-800 shadow-sm">
            <p className="mb-2 text-xs font-medium text-gray-400">
              판단 지점 에이전트 결과 (디버그용)
            </p>
            {isJudgingJob && <p className="text-gray-500">분석 중...</p>}
            {judgeResult && (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-700">
                {JSON.stringify(judgeResult, null, 2)}
              </pre>
            )}
          </div>
        )}

        {matchResult && parsedJob && (
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8">
            <div className="flex flex-col items-center gap-1 border-b border-gray-100 pb-6">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                매칭 점수
              </span>
              <span className={`text-5xl font-bold ${scoreColorClass(matchResult.score)}`}>
                {matchResult.score}%
              </span>
            </div>

            <div className="flex flex-col gap-1 border-b border-gray-100 py-4 text-sm text-gray-700">
              <p>
                📋 지원 방법:{" "}
                <span className="font-medium">
                  {SUBMISSION_METHOD_LABELS[parsedJob.submission_method]}
                </span>
              </p>
              <p>
                📎 필요 서류:{" "}
                <span className="font-medium">
                  {parsedJob.required_documents.length > 0
                    ? parsedJob.required_documents.join(", ")
                    : "명시된 서류 없음"}
                </span>
              </p>
            </div>

            <div className="pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                부족한 스택
              </p>
              {matchResult.gap_stacks.length === 0 ? (
                <p className="text-sm text-gray-500">부족한 스택 없음</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {matchResult.gap_stacks.map((stack) => (
                    <span
                      key={stack}
                      className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700 ring-1 ring-red-200"
                    >
                      {stack}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4">
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
                  className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
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
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              이력서 재구성 제안
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-700">
              <span>
                원본 <span className={`font-bold ${scoreColorClass(matchResult.score)}`}>
                  {matchResult.score}%
                </span>
              </span>
              <span>→</span>
              <span>
                개선 후{" "}
                <span className={`font-bold ${scoreColorClass(improvedMatch.score)}`}>
                  {improvedMatch.score}%
                </span>
              </span>
              <span>→</span>
              <span>
                잠재 최대{" "}
                <span className={`font-bold ${scoreColorClass(potentialMatch.score)}`}>
                  {potentialMatch.score}%
                </span>
              </span>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-4 text-sm text-gray-800">
              {suggestionResult.resume_suggestion}
            </pre>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                개선 제안서
              </p>
              {!improvementSuggestions || improvementSuggestions.length === 0 ? (
                <p className="text-sm text-gray-500">개선 제안 없음</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {improvementSuggestions.map((stack) => (
                    <li
                      key={stack}
                      className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100"
                    >
                      <span className="font-semibold">{stack}</span> — 보유 여부는
                      사용자가 직접 판단
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                예상 기술면접 꼬리질문
              </p>
              <ol className="flex flex-col gap-2">
                {suggestionResult.interview_questions.map((question, i) => (
                  <li key={i} className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900 ring-1 ring-indigo-100">
                    {i + 1}. {question}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
