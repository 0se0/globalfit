import Link from "next/link";
import { ProtoNav } from "../../_components/ProtoNav";

export default function CompanyError() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="company" state="error" />

        <div className="flex items-center justify-between border border-gray-400 p-2">
          <span>global fit · 기업분석</span>
          <Link href="/proto" className="border border-gray-400 px-2 py-0.5 text-xs">
            메인으로
          </Link>
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <div className="flex gap-2">
            <input readOnly className="flex-1 border border-gray-400 p-1.5 text-xs" value="회사명 · ○○○" />
            <input
              readOnly
              className="flex-1 border border-gray-400 p-1.5 text-xs text-gray-500"
              value="관심 직무"
            />
            <button type="button" className="border border-gray-400 px-2 py-1 text-xs">
              분석
            </button>
          </div>

          <div className="border border-gray-400 p-2 text-xs">
            <p className="font-semibold">
              기업분석에 실패했습니다 <span className="font-normal text-gray-500">companyError</span>
            </p>
            <p className="mt-1 text-gray-500">
              회사 정보를 찾지 못했거나 응답이 지연되었습니다. 회사명을 정확히 입력했는지 확인해
              주세요.
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="border border-gray-400 px-2 py-1">
                재시도
              </button>
              <button type="button" className="border border-gray-400 px-2 py-1">
                회사명 수정
              </button>
            </div>
          </div>

          <div className="border border-gray-300 p-2 text-xs text-gray-500">
            리포트/다운로드 영역은 표시하지 않음
          </div>
          <div className="h-32 border border-gray-300" />
        </div>
      </div>
    </div>
  );
}
