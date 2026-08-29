import { ProtoNav } from "../../_components/ProtoNav";

export default function SuggestionLoading() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="suggestion" state="loading" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ② 매칭 결과 섹션 (접힘)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <p className="font-semibold">문서 재구성 제안</p>

          <div className="border border-gray-400 p-3 text-xs">
            <p>
              제안 생성 중... <span className="text-gray-500">문서 3건 · 최대 1분</span>
            </p>
            <div className="mt-2 flex h-1.5 border border-gray-400">
              <div className="h-full w-[35%] bg-gray-400" />
            </div>
          </div>

          <div className="flex border border-gray-300">
            <div className="flex-1 border-r border-gray-300 p-2">
              <p className="text-xs text-gray-400">원본</p>
              <div className="mt-1 h-4 w-8 bg-gray-200" />
            </div>
            <div className="flex-1 border-r border-gray-300 p-2">
              <p className="text-xs text-gray-400">개선 후</p>
              <div className="mt-1 h-4 w-8 bg-gray-200" />
            </div>
            <div className="flex-1 p-2">
              <p className="text-xs text-gray-400">잠재 최대</p>
              <div className="mt-1 h-4 w-8 bg-gray-200" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border border-gray-300 p-2">
            <div className="h-1.5 w-[94%] bg-gray-200" />
            <div className="h-1.5 w-[82%] bg-gray-200" />
            <div className="h-1.5 w-[88%] bg-gray-200" />
            <div className="h-1.5 w-[60%] bg-gray-200" />
          </div>
          <div className="flex flex-col gap-1.5 border border-gray-300 p-2">
            <div className="h-1.5 w-[90%] bg-gray-200" />
            <div className="h-1.5 w-[70%] bg-gray-200" />
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
