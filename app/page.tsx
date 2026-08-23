"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";

// 서버가 못 가져오는 사이트(봇 차단, IP 평판 차단 등)에서 쓰는 북마클릿 —
// 사용자 본인 브라우저에서 실행되므로 서버측 차단과 무관하게 항상 동작함.
// 우리 서버의 본문 추출 로직(태그 제거 목록)과 동일하게 맞춤
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

export default function Home() {
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<ResumeFile | null>(null);
  const [savedEntry, setSavedEntry] = useState<SavedEntry | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const isJdUrl = URL_ONLY_PATTERN.test(jdText.trim());
  const isEmpty = !jdText.trim() || (!resumeText.trim() && !resumeFile);
  const isBlocked = isJdUrl || isEmpty;
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

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

  function handleSubmit(e: SubmitEvent) {
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
  }

  function handleReset() {
    localStorage.removeItem(STORAGE_KEY);
    setJdText("");
    setResumeText("");
    setResumeFile(null);
    setSavedEntry(null);
    setFetchError(null);
    setFileError(null);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">
        GlobalFit — 국내/해외 채용공고-이력서 핏 분석기
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="jd" className="text-sm font-medium">
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
            className="min-h-32 rounded-md border border-gray-300 p-3 text-sm"
          />
          {isJdUrl && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleFetchUrl}
                disabled={isFetchingUrl}
                className="self-start rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {isFetchingUrl ? "가져오는 중..." : "URL에서 가져오기"}
              </button>
              {fetchError && <p className="text-sm text-red-600">{fetchError}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="resume" className="text-sm font-medium">
            이력서
          </label>
          {resumeFile ? (
            <div className="flex items-center gap-2 rounded-md border border-gray-300 p-3 text-sm">
              <span>📎 {resumeFile.name}</span>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="text-gray-500 underline"
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
              className="min-h-32 rounded-md border border-gray-300 p-3 text-sm"
            />
          )}
          <input
            type="file"
            accept=".pdf,.docx,.html,.htm,.hwp"
            onChange={handleFileChange}
            className="text-sm"
          />
          {fileError && <p className="text-sm text-red-600">{fileError}</p>}
        </div>

        {!isJdUrl && isEmpty && (
          <p className="text-sm text-red-600">공고와 이력서를 모두 입력해 주세요.</p>
        )}

        <button
          type="submit"
          disabled={isBlocked}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          제출
        </button>
      </form>

      <button
        type="button"
        onClick={handleReset}
        className="self-start text-sm text-gray-500 underline"
      >
        초기화
      </button>

      <div className="rounded-md border border-gray-200 p-4 text-sm text-gray-600">
        <p className="mb-1 font-medium text-gray-800">
          URL 가져오기가 안 되는 사이트라면?
        </p>
        <p className="mb-2">
          아래 버튼을 즐겨찾기 바로 드래그해 두세요. 공고 페이지에서 클릭하면
          화면에 보이는 텍스트가 복사됩니다 — 서버가 아니라 지금 보고 계신
          브라우저에서 직접 긁어오는 방식이라 차단되는 사이트에서도 동작해요.
        </p>
        <a
          ref={bookmarkletRef}
          onClick={(e) => e.preventDefault()}
          className="inline-block cursor-move rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white"
        >
          📌 텍스트 긁어오기
        </a>
      </div>

      {savedEntry && (
        <div className="rounded-md border border-gray-200 p-4 text-sm">
          <p className="mb-2 text-xs text-gray-500">
            저장됨 ({savedEntry.savedAt})
          </p>
          <p>
            <span className="font-medium">공고:</span>{" "}
            {savedEntry.jdText.slice(0, 30)}
          </p>
          <p>
            <span className="font-medium">이력서:</span>{" "}
            {savedEntry.resumeFile
              ? `📎 ${savedEntry.resumeFile.name}`
              : savedEntry.resumeText.slice(0, 30)}
          </p>
        </div>
      )}
    </div>
  );
}
