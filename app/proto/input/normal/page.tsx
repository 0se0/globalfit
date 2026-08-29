import Link from "next/link";
import { ProtoNav } from "../../_components/ProtoNav";

export default function InputNormal() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="input" state="normal" />

        <div className="flex items-center justify-between border border-gray-400 p-2">
          <span>global fit</span>
          <span className="border border-gray-400 px-2 py-0.5 text-xs">기업분석</span>
        </div>

        <div className="flex flex-col gap-4 border border-gray-400 p-4">
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">① 채용공고</p>
            <div className="flex">
              <span className="border border-gray-400 bg-gray-200 px-2 py-1 text-xs">
                텍스트 붙여넣기
              </span>
              <span className="border border-gray-400 border-l-0 px-2 py-1 text-xs text-gray-500">
                URL
              </span>
            </div>
            <textarea
              readOnly
              className="h-24 w-full border border-gray-400 p-2 text-xs"
              value={
                "We are hiring a Backend Engineer.\nRequired: React, TypeScript, Next.js.\nPreferred: GraphQL.\nApply via company careers page."
              }
            />
            <div className="flex gap-2">
              <input
                readOnly
                className="flex-1 border border-gray-400 p-1.5 text-xs text-gray-500"
                value="공고 URL"
              />
              <button type="button" disabled className="border border-gray-400 px-2 py-1 text-xs">
                가져오기
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-gray-300 pt-3">
            <p className="font-semibold">② 이력서</p>
            <textarea
              readOnly
              className="h-20 w-full border border-gray-400 p-2 text-xs"
              value={"3년차 프론트엔드 개발자. React, TypeScript, Node 사용 경험."}
            />
            <div className="flex items-center gap-2">
              <button type="button" disabled className="border border-gray-400 px-2 py-1 text-xs">
                파일 선택
              </button>
              <span className="text-xs text-gray-500">resume.pdf · 추출 완료</span>
            </div>
            <p className="text-xs text-gray-500">PDF · DOCX · HTML (HWP 미지원)</p>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-gray-300 pt-3">
            <p className="font-semibold">
              ③ 자소서 <span className="font-normal text-gray-500">(선택)</span>
            </p>
            <textarea
              readOnly
              className="h-14 w-full border border-gray-400 p-2 text-xs"
              value={"지원 동기: 프론트엔드 팀에 기여하고 싶습니다."}
            />
            <p className="mt-1 font-semibold">
              ④ 포트폴리오 <span className="font-normal text-gray-500">(선택)</span>
            </p>
            <textarea
              readOnly
              className="h-14 w-full border border-gray-400 p-2 text-xs"
              value={"1. 사내 대시보드 리뉴얼\n2. 결제 배치 스크립트"}
            />
          </div>

          <Link
            href="/proto/match/normal"
            className="border border-gray-400 bg-gray-200 p-2 text-center font-semibold"
          >
            매칭 결과 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
