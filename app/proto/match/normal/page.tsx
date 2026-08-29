import Link from "next/link";
import { ProtoNav } from "../../_components/ProtoNav";

export default function MatchNormal() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="match" state="normal" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ① 입력 섹션 (접힘)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <p className="font-semibold">매칭 결과</p>

          <div className="flex border border-gray-400">
            <div className="flex-1 border-r border-gray-400 p-3">
              <p className="text-xs text-gray-500">매칭 점수</p>
              <p className="text-2xl font-semibold">72</p>
              <p className="text-xs text-gray-500">클라이언트 계산 · calculateMatch</p>
            </div>
            <div className="flex-1 p-3 text-xs">
              <p>
                <span className="text-gray-500">제출 방법</span>
                <br />
                자사 채용 페이지
              </p>
              <p className="mt-2">
                <span className="text-gray-500">필요 서류</span>
                <br />
                이력서 · 자소서 · 포트폴리오
              </p>
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">
              공고 분석 <span className="font-normal text-gray-500">parse-job</span>
            </div>
            <div className="flex flex-col gap-1 p-2 text-xs">
              <p>
                <span className="inline-block w-16 text-gray-500">직무</span>프론트엔드 엔지니어
              </p>
              <p>
                <span className="inline-block w-16 align-top text-gray-500">요구 스택</span>
                <span className="inline-flex flex-wrap gap-1">
                  {["React", "TypeScript", "Next.js", "GraphQL"].map((s) => (
                    <span key={s} className="border border-gray-400 px-1.5 py-0.5">
                      {s}
                    </span>
                  ))}
                </span>
              </p>
              <p>
                <span className="inline-block w-16 text-gray-500">근무지</span>서울 / 하이브리드
              </p>
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">
              지원서류 분석 <span className="font-normal text-gray-500">parse-applicant</span>
            </div>
            <div className="flex flex-col gap-1 p-2 text-xs">
              <p>
                <span className="inline-block w-16 align-top text-gray-500">보유 스택</span>
                <span className="inline-flex flex-wrap gap-1">
                  {["React", "TypeScript", "Node"].map((s) => (
                    <span key={s} className="border border-gray-400 px-1.5 py-0.5">
                      {s}
                    </span>
                  ))}
                </span>
              </p>
              <p>
                <span className="inline-block w-16 text-gray-500">경력</span>2년 · 프로젝트 4건
              </p>
            </div>
          </div>

          <div className="border border-gray-400">
            <div className="border-b border-gray-400 p-2 text-xs font-semibold">
              판단 지점 <span className="font-normal text-gray-500">judge-job</span>
            </div>
            <div className="flex flex-col gap-2 p-2 text-xs">
              <div className="border border-gray-400 p-1.5">지원 가능 여부 — 가능 (근거 2줄)</div>
              <div className="border border-gray-400 p-1.5">비자/체류 조건 — 확인 필요</div>
            </div>
          </div>

          <div className="border border-gray-400 p-2 text-xs">
            <p className="font-semibold">부족 스택</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {["Next.js", "GraphQL"].map((s) => (
                <span key={s} className="border border-gray-400 px-1.5 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <Link
            href="/proto/suggestion/normal"
            className="border border-gray-400 bg-gray-200 p-2 text-center font-semibold"
          >
            이력서 재구성 제안 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
