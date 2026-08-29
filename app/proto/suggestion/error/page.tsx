import { ProtoNav } from "../../_components/ProtoNav";

export default function SuggestionError() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="suggestion" state="error" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ② 매칭 결과 섹션 (접힘)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <p className="font-semibold">문서 재구성 제안</p>

          <div className="border border-gray-400 p-2 text-xs">
            <p className="font-semibold">
              제안을 생성하지 못했습니다{" "}
              <span className="font-normal text-gray-500">suggestionError</span>
            </p>
            <p className="mt-1 text-gray-500">
              응답이 비었거나 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="border border-gray-400 px-2 py-1">
                재시도
              </button>
              <button type="button" className="border border-gray-400 px-2 py-1">
                이력서만으로 재시도
              </button>
            </div>
          </div>

          <div className="border border-gray-300 p-2 text-xs text-gray-500">
            이미 계산된 매칭 점수(② 매칭 결과)는 그대로 남아 있어야 함 — 이 에러는 이 섹션에만
            국한
          </div>

          <div className="h-28 border border-gray-300" />
        </div>
      </div>
    </div>
  );
}
