"use client";

import { useEffect, useState, type SubmitEvent } from "react";

const STORAGE_KEY = "globalfit:last-session";

interface SavedEntry {
  jdText: string;
  resumeText: string;
  savedAt: string;
}

export default function Home() {
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [savedEntry, setSavedEntry] = useState<SavedEntry | null>(null);

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
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="이력서 텍스트"
        />
        <button type="submit">저장</button>
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
