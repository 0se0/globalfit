import { ProtoNav } from "../../_components/ProtoNav";

export default function SuggestionNormal() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="suggestion" state="normal" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ② 매칭 결과 섹션 (접힘)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <p className="font-semibold">문서 재구성 제안</p>

          <div className="flex border border-gray-400">
            <div className="flex-1 border-r border-gray-400 p-2">
              <p className="text-xs text-gray-500">원본</p>
              <p className="text-lg font-semibold">72</p>
            </div>
            <div className="flex-1 border-r border-gray-400 p-2">
              <p className="text-xs text-gray-500">개선 후</p>
              <p className="text-lg font-semibold">84</p>
            </div>
            <div className="flex-1 p-2">
              <p className="text-xs text-gray-500">잠재 최대</p>
              <p className="text-lg font-semibold">91</p>
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="flex items-center justify-between border-b border-gray-400 p-2 text-xs font-semibold">
              <span>이력서 재구성문</span>
              <span className="border border-gray-400 px-1.5 py-0.5 font-normal">복사</span>
            </div>
            <div className="flex flex-col gap-1.5 p-2">
              <div className="h-1.5 w-[94%] bg-gray-300" />
              <div className="h-1.5 w-[88%] bg-gray-300" />
              <div className="h-1.5 w-[92%] bg-gray-300" />
              <div className="h-1.5 w-[66%] bg-gray-300" />
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">
              자소서 재구성문 <span className="font-normal text-gray-500">입력 시에만</span>
            </div>
            <div className="flex flex-col gap-1.5 p-2">
              <div className="h-1.5 w-[90%] bg-gray-300" />
              <div className="h-1.5 w-[72%] bg-gray-300" />
              <div className="h-1.5 w-[84%] bg-gray-300" />
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">
              포트폴리오 재구성문 <span className="font-normal text-gray-500">입력 시에만</span>
            </div>
            <div className="flex flex-col gap-1.5 p-2">
              <div className="h-1.5 w-[86%] bg-gray-300" />
              <div className="h-1.5 w-[62%] bg-gray-300" />
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">개선 제안서</div>
            <div className="flex flex-col gap-1.5 p-2 text-xs">
              <div className="border border-gray-400 p-1.5">1. 부족 스택(Next.js) 관련 경험 명시</div>
              <div className="border border-gray-400 p-1.5">2. 성과를 수치로 재작성</div>
              <div className="border border-gray-400 p-1.5">3. 공고 키워드에 맞춘 문장 순서 변경</div>
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">
              기술면접 꼬리질문 2개
            </div>
            <div className="flex flex-col gap-1.5 p-2 text-xs">
              <div className="border border-gray-400 p-1.5">
                Q1 React 상태관리 라이브러리 선택 기준은 무엇이었나요?
              </div>
              <div className="border border-gray-400 p-1.5">
                Q2 API 서버 배치 작업 자동화 시 실패 처리는 어떻게 했나요?
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
