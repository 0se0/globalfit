"use client";

import { useEffect, useState, type SubmitEvent } from "react";

const STORAGE_KEY = "globalfit:last-session";
// URL만 붙여넣는 경우를 걸러내기 위한 검사 — 크롤러는 CLAUDE.md 하드 룰로 금지라
// URL을 받아도 내용을 못 가져오므로, 대신 텍스트 복붙을 요구하는 경고만 띄운다
const URL_ONLY_PATTERN = /^https?:\/\/\S+$/i;

interface SavedEntry {
  jdText: string;
  resumeText: string;
  savedAt: string;
}

export default function Home() {
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [savedEntry, setSavedEntry] = useState<SavedEntry | null>(null);
  const isJdUrl = URL_ONLY_PATTERN.test(jdText.trim());

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entry: SavedEntry = JSON.parse(raw);
    // localStorage는 서버에 없어 useState 초기값으로 바로 읽으면 하이드레이션 불일치가 남 —
    // 마운트 후 effect에서 한 번만 동기화하는 게 유일한 방법
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJdText(entry.jdText);
    setResumeText(entry.resumeText);
    setSavedEntry(entry);
  }, []);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (isJdUrl) return;
    const entry: SavedEntry = {
      jdText,
      resumeText,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    setSavedEntry(entry);
  }

  return (
    <div>
      <h1>GlobalFit — 국내/해외 채용공고-이력서 핏 분석기</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="공고 텍스트"
        />
        {isJdUrl && (
          <p>URL은 지원하지 않습니다. 공고 내용을 텍스트로 복사해서 붙여넣어 주세요.</p>
        )}
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="이력서 텍스트 (PDF/DOCX/HWP 파일 업로드는 지원하지 않습니다 — 텍스트를 복사해서 붙여넣어 주세요)"
        />
        <button type="submit" disabled={isJdUrl}>
          저장
        </button>
      </form>
      <ul>
        {savedEntry && (
          <li>
            저장됨 ({savedEntry.savedAt}) — 공고: {savedEntry.jdText.slice(0, 30)} / 이력서:{" "}
            {savedEntry.resumeText.slice(0, 30)}
          </li>
        )}
      </ul>
    </div>
  );
}
