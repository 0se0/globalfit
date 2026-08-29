import { ProtoNav } from "../../_components/ProtoNav";

export default function InputEmpty() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="input" state="empty" />

        <div className="flex items-center justify-between border border-gray-400 p-2">
          <span>global fit</span>
          <span className="border border-gray-400 px-2 py-0.5 text-xs">기업분석</span>
        </div>

        <div className="flex flex-col gap-4 border border-gray-400 p-4">
          <div className="border border-gray-400 p-2 text-xs">
            공고와 이력서를 모두 입력해 주세요
            <div className="mt-1 text-gray-500">
              URL만 입력하고 아직 "가져오기"를 누르지 않은 경우도 제출이 막힙니다
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">① 채용공고</p>
            <div className="flex h-24 w-full items-center border border-gray-400 p-2 text-xs text-gray-400">
              공고 본문을 붙여넣으세요
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                className="flex-1 border border-gray-400 p-1.5 text-xs text-gray-400"
                value="공고 URL"
              />
              <button type="button" disabled className="border border-gray-400 px-2 py-1 text-xs text-gray-400">
                가져오기
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-gray-300 pt-3">
            <p className="font-semibold">② 이력서</p>
            <div className="flex h-16 w-full items-center border border-gray-400 p-2 text-xs text-gray-400">
              이력서를 붙여넣거나 파일을 올리세요
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled className="border border-gray-400 px-2 py-1 text-xs">
                파일 선택
              </button>
              <span className="text-xs text-gray-400">선택된 파일 없음</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-gray-300 pt-3">
            <p className="font-semibold">
              ③ 자소서 <span className="font-normal text-gray-500">(선택)</span>
            </p>
            <div className="h-14 border border-gray-400" />
            <p className="mt-1 font-semibold">
              ④ 포트폴리오 <span className="font-normal text-gray-500">(선택)</span>
            </p>
            <div className="h-14 border border-gray-400" />
          </div>

          <div className="border border-gray-300 p-2 text-center text-gray-400">
            매칭 결과 보기 (비활성)
          </div>
        </div>
      </div>
    </div>
  );
}
