import { ProtoNav } from "../../_components/ProtoNav";

export default function MatchLoading() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="match" state="loading" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ① 입력 섹션 (접힘)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <p className="font-semibold">매칭 결과</p>

          <div className="flex flex-col gap-2 border border-gray-400 p-3 text-xs">
            <div className="flex justify-between">
              <span>공고 분석 (parse-job)</span>
              <span className="text-gray-500">완료</span>
            </div>
            <div className="flex h-1.5 border border-gray-400">
              <div className="h-full w-full bg-gray-400" />
            </div>
            <div className="flex justify-between">
              <span>지원서류 분석 (parse-applicant)</span>
              <span className="text-gray-500">진행 중...</span>
            </div>
            <div className="flex h-1.5 border border-gray-400">
              <div className="h-full w-[55%] bg-gray-400" />
            </div>
            <div className="flex justify-between text-gray-400">
              <span>판단 지점 (judge-job)</span>
              <span>대기</span>
            </div>
            <div className="h-1.5 border border-gray-300" />
          </div>

          <div className="flex border border-gray-300">
            <div className="flex-1 border-r border-gray-300 p-3">
              <p className="text-xs text-gray-400">매칭 점수</p>
              <div className="mt-1 h-5 w-12 bg-gray-200" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <div className="h-1.5 w-4/5 bg-gray-200" />
              <div className="h-1.5 w-3/5 bg-gray-200" />
              <div className="h-1.5 w-2/3 bg-gray-200" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 border border-gray-300 p-2">
            <div className="h-1.5 w-5/6 bg-gray-200" />
            <div className="h-1.5 w-3/4 bg-gray-200" />
            <div className="h-1.5 w-3/5 bg-gray-200" />
          </div>
          <div className="flex flex-col gap-1.5 border border-gray-300 p-2">
            <div className="h-1.5 w-4/5 bg-gray-200" />
            <div className="h-1.5 w-1/2 bg-gray-200" />
          </div>

          <div className="border border-gray-300 p-2 text-center text-gray-400">
            이력서 재구성 제안 보기 (대기)
          </div>
        </div>
      </div>
    </div>
  );
}
