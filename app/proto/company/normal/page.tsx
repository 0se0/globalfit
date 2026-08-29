import Link from "next/link";
import { ProtoNav } from "../../_components/ProtoNav";

export default function CompanyNormal() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="company" state="normal" />

        <div className="flex items-center justify-between border border-gray-400 p-2">
          <span>global fit · 기업분석</span>
          <Link href="/proto" className="border border-gray-400 px-2 py-0.5 text-xs">
            메인으로
          </Link>
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <div className="flex gap-2">
            <input readOnly className="flex-1 border border-gray-400 p-1.5 text-xs" value="회사명 · ○○○" />
            <input
              readOnly
              className="flex-1 border border-gray-400 p-1.5 text-xs text-gray-500"
              value="관심 직무 (선택)"
            />
            <button type="button" disabled className="border border-gray-400 px-2 py-1 text-xs">
              분석
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-gray-300 pt-3">
            <p className="font-semibold">기업분석 리포트</p>
            <button type="button" className="border border-gray-400 px-2 py-1 text-xs">
              마크다운 다운로드
            </button>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">기업정보</div>
            <div className="flex flex-col gap-1 p-2 text-xs">
              <p>
                <span className="inline-block w-14 text-gray-500">설립</span>—
              </p>
              <p>
                <span className="inline-block w-14 text-gray-500">규모</span>—
              </p>
              <p>
                <span className="inline-block w-14 text-gray-500">사업영역</span>—
              </p>
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">사업분석</div>
            <div className="flex flex-col gap-1.5 p-2">
              <div className="h-1.5 w-[92%] bg-gray-300" />
              <div className="h-1.5 w-[80%] bg-gray-300" />
              <div className="h-1.5 w-[86%] bg-gray-300" />
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">환경분석 (SWOT)</div>
            <div className="grid grid-cols-2 text-xs">
              {["S", "W", "O", "T"].map((letter, i) => (
                <div
                  key={letter}
                  className={`p-2 ${i % 2 === 0 ? "border-r border-gray-300" : ""} ${
                    i < 2 ? "border-b border-gray-300" : ""
                  }`}
                >
                  <p className="font-semibold">{letter}</p>
                  <div className="mt-1.5 h-1.5 w-4/5 bg-gray-300" />
                  <div className="mt-1 h-1.5 w-3/5 bg-gray-300" />
                </div>
              ))}
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">
              채용전략 + 준비 로드맵
            </div>
            <div className="flex flex-col gap-1.5 p-2 text-xs">
              <div className="border border-gray-400 p-1.5">1개월 — 부족 스택 학습</div>
              <div className="border border-gray-400 p-1.5">3개월 — 사이드 프로젝트</div>
              <div className="border border-gray-400 p-1.5">6개월 — 지원 서류 준비</div>
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">출처</div>
            <div className="flex flex-col gap-1 p-2 text-xs text-gray-500">
              <div>[1] 회사 공식 홈페이지</div>
              <div>[2] 채용 플랫폼 공고</div>
              <div>[3] 뉴스 기사</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
