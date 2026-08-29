import { ProtoNav } from "../../_components/ProtoNav";

export default function InputError() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="input" state="error" />

        <div className="flex items-center justify-between border border-gray-400 p-2">
          <span>global fit</span>
          <span className="border border-gray-400 px-2 py-0.5 text-xs">기업분석</span>
        </div>

        <div className="flex flex-col gap-4 border border-gray-400 p-4">
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">① 채용공고</p>
            <div className="border border-gray-400 p-2 text-xs">
              <p className="font-semibold">
                공고를 가져오지 못했습니다 <span className="font-normal text-gray-500">fetchError</span>
              </p>
              <p className="mt-1 text-gray-500">해당 URL 크롤링 실패. 본문을 직접 붙여넣어 주세요.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="border border-gray-400 px-2 py-1">
                  다시 시도
                </button>
                <button type="button" className="border border-gray-400 px-2 py-1">
                  텍스트로 붙여넣기
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                className="flex-1 border border-gray-400 p-1.5 text-xs text-gray-500"
                value="https://example.com/jobs/1234"
              />
              <button type="button" className="border border-gray-400 px-2 py-1 text-xs">
                가져오기
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-gray-300 pt-3">
            <p className="font-semibold">② 이력서</p>
            <div className="flex h-14 w-full items-center border border-gray-400 p-2 text-xs text-gray-400">
              이력서를 붙여넣거나 파일을 올리세요
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="border border-gray-400 px-2 py-1 text-xs">
                파일 선택
              </button>
              <span className="text-xs text-gray-500">resume.hwp</span>
            </div>
            <div className="border border-gray-400 p-2 text-xs">
              <p className="font-semibold">
                파일을 읽지 못했습니다 <span className="font-normal text-gray-500">fileError</span>
              </p>
              <p className="mt-1 text-gray-500">
                지원하지 않는 형식(HWP) 또는 용량 초과 · PDF/DOCX/HTML, 최대 3MB
              </p>
            </div>
          </div>

          <p className="border-t border-gray-300 pt-3 text-xs text-gray-500">
            ③ 자소서 / ④ 포트폴리오 (선택) — 변경 없음
          </p>

          <div className="border border-gray-300 p-2 text-center text-gray-400">
            매칭 결과 보기 (비활성)
          </div>
        </div>
      </div>
    </div>
  );
}
