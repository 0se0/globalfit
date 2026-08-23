"use client";

import { useEffect, useState, type SubmitEvent } from "react";

const STORAGE_KEY = "globalfit:last-session";
// URL 가져오기는 별도 슬라이스라 이번 기능에서는 아직 구현 안 됨 —
// URL만 붙여넣으면 텍스트 복붙을 요구하는 경고만 띄운다
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
  const isEmpty = !jdText.trim() || !resumeText.trim();
  const isBlocked = isJdUrl || isEmpty;

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
    if (isBlocked) return;
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
          <p>해당 URL을 살펴볼 수 없습니다. 텍스트로 복사해서 붙여넣어 주세요.</p>
        )}
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="이력서 텍스트 (PDF/DOCX/HWP 파일 업로드는 지원하지 않습니다 — 텍스트를 복사해서 붙여넣어 주세요)"
        />
        {!isJdUrl && isEmpty && <p>공고와 이력서를 모두 입력해 주세요.</p>}
        <button type="submit" disabled={isBlocked}>
          제출
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
