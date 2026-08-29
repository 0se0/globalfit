import Link from "next/link";
import { ProtoNav } from "../../_components/ProtoNav";

export default function CompanyLoading() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="company" state="loading" />

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
              value="관심 직무"
            />
            <button type="button" disabled className="border border-gray-400 px-2 py-1 text-xs text-gray-400">
              분석 중...
            </button>
          </div>

          <div className="border border-gray-400 p-3 text-xs">
            <p>기업정보 수집 · 웹 출처 확인 중...</p>
            <div className="mt-2 flex h-1.5 border border-gray-400">
              <div className="h-full w-[40%] bg-gray-400" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border border-gray-300 p-2">
            <div className="h-1.5 w-[90%] bg-gray-200" />
            <div className="h-1.5 w-[66%] bg-gray-200" />
          </div>
          <div className="flex flex-col gap-1.5 border border-gray-300 p-2">
            <div className="h-1.5 w-[92%] bg-gray-200" />
            <div className="h-1.5 w-[80%] bg-gray-200" />
            <div className="h-1.5 w-[70%] bg-gray-200" />
          </div>
          <div className="grid grid-cols-2 border border-gray-300">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`p-3 ${i % 2 === 0 ? "border-r border-gray-200" : ""} ${
                  i < 2 ? "border-b border-gray-200" : ""
                }`}
              >
                <div className="h-1.5 w-3/5 bg-gray-200" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 border border-gray-300 p-2">
            <div className="h-1.5 w-[76%] bg-gray-200" />
            <div className="h-1.5 w-[58%] bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
