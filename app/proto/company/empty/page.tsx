import Link from "next/link";
import { ProtoNav } from "../../_components/ProtoNav";

export default function CompanyEmpty() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="company" state="empty" />

        <div className="flex items-center justify-between border border-gray-400 p-2">
          <span>global fit · 기업분석</span>
          <Link href="/proto" className="border border-gray-400 px-2 py-0.5 text-xs">
            메인으로
          </Link>
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">
              회사명 <span className="font-normal text-gray-500">필수</span>
            </p>
            <div className="border border-gray-400 p-1.5 text-xs text-gray-400">
              예: 회사 이름을 입력하세요
            </div>
            <p className="mt-1 font-semibold">
              관심 직무 <span className="font-normal text-gray-500">선택</span>
            </p>
            <div className="border border-gray-400 p-1.5 text-xs text-gray-400">
              예: 프론트엔드 엔지니어
            </div>
          </div>

          <div className="border border-gray-300 p-2 text-center text-gray-400">
            기업분석 보기 (비활성)
          </div>
          <p className="text-xs text-gray-500">
            회사명을 입력하면 버튼이 활성화됩니다. 리포트 영역은 아직 없음.
          </p>
          <div className="h-36 border border-gray-300" />
        </div>
      </div>
    </div>
  );
}
