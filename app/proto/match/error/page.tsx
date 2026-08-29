import { ProtoNav } from "../../_components/ProtoNav";

export default function MatchError() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="match" state="error" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ① 입력 섹션 (접힘)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <p className="font-semibold">매칭 결과</p>

          <div className="border border-gray-400 p-2 text-xs">
            <p className="font-semibold">
              공고 분석 실패 <span className="font-normal text-gray-500">parseJobError</span>
            </p>
            <p className="mt-1 text-gray-500">공고 본문을 구조화하지 못했습니다.</p>
            <button type="button" className="mt-2 inline-block border border-gray-400 px-2 py-1">
              재시도
            </button>
          </div>

          <div className="border border-gray-400 p-2 text-xs">
            <p className="font-semibold">
              지원서류 분석 실패{" "}
              <span className="font-normal text-gray-500">parseApplicantError</span>
            </p>
            <button type="button" className="mt-2 inline-block border border-gray-400 px-2 py-1">
              재시도
            </button>
          </div>

          <div className="border border-gray-400 p-2 text-xs">
            <p className="font-semibold">
              판단 지점 실패 <span className="font-normal text-gray-500">judgeError</span>
            </p>
            <p className="mt-1 text-gray-500">판단 지점 없이도 매칭 점수는 계산됩니다.</p>
            <button type="button" className="mt-2 inline-block border border-gray-400 px-2 py-1">
              재시도
            </button>
          </div>

          <div className="border border-gray-400 p-2 text-xs text-gray-500">
            부분 성공 시: 성공한 섹션만 위에 그대로 표시하고, 실패한 섹션 자리에만 에러카드를
            넣는다
          </div>

          <div className="border border-gray-300 p-2 text-center text-gray-400">
            이력서 재구성 제안 보기 (비활성)
          </div>
        </div>
      </div>
    </div>
  );
}
