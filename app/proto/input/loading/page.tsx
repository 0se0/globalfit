import { ProtoNav } from "../../_components/ProtoNav";

export default function InputLoading() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="input" state="loading" />

        <div className="flex items-center justify-between border border-gray-400 p-2">
          <span>global fit</span>
          <span className="border border-gray-400 px-2 py-0.5 text-xs">기업분석</span>
        </div>

        <div className="flex flex-col gap-4 border border-gray-400 p-4">
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">① 채용공고</p>
            <div className="flex h-24 w-full items-center justify-center border border-gray-400 text-xs text-gray-500">
              공고 본문 가져오는 중...
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                className="flex-1 border border-gray-400 p-1.5 text-xs text-gray-500"
                value="https://example.com/jobs/1234"
              />
              <button type="button" disabled className="border border-gray-400 px-2 py-1 text-xs text-gray-400">
                가져오는 중...
              </button>
            </div>
            <div className="flex h-2 w-full border border-gray-400">
              <div className="h-full w-[45%] bg-gray-400" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-gray-300 pt-3">
            <p className="font-semibold">② 이력서</p>
            <div className="flex h-20 w-full items-center justify-center border border-gray-400 text-xs text-gray-500">
              resume.pdf — 텍스트 추출 중...
            </div>
            <div className="flex h-2 w-full border border-gray-400">
              <div className="h-full w-[70%] bg-gray-400" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-gray-300 pt-3 text-gray-400">
            <p className="font-semibold">③ 자소서 (선택)</p>
            <div className="h-14 border border-gray-300" />
            <p className="mt-1 font-semibold">④ 포트폴리오 (선택)</p>
            <div className="h-14 border border-gray-300" />
          </div>

          <div className="border border-gray-300 p-2 text-center text-gray-400">
            매칭 결과 보기 (대기)
          </div>
        </div>
      </div>
    </div>
  );
}
