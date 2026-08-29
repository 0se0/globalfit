import { ProtoNav } from "../../_components/ProtoNav";

export default function SuggestionEmpty() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="suggestion" state="empty" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ② 매칭 결과 섹션 (표시 중)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <p className="font-semibold">문서 재구성 제안</p>
          <button type="button" className="border border-gray-400 bg-gray-200 p-2 text-center font-semibold">
            이력서 재구성 제안 보기
          </button>
          <p className="text-xs text-gray-500">
            버튼을 누르기 전에는 결과 영역이 없습니다. 자소서·포트폴리오를 입력했다면 함께
            재구성됩니다.
          </p>
          <div className="h-36 border border-gray-300" />
        </div>
      </div>
    </div>
  );
}
