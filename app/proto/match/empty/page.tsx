import Link from "next/link";
import { ProtoNav } from "../../_components/ProtoNav";

export default function MatchEmpty() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ProtoNav screen="match" state="empty" />

        <div className="border border-gray-400 p-2 text-xs text-gray-500">
          ↑ ① 입력 섹션 (표시 중)
        </div>

        <div className="flex flex-col gap-3 border border-gray-400 p-4">
          <div className="border border-gray-400 p-3 text-center text-xs leading-relaxed text-gray-500">
            제출 전에는 이 섹션이 <span className="font-semibold text-black">렌더링되지 않음</span>
            <br />
            <span className="text-gray-400">parsedJob · parsedApplicant 없음 → DOM 없음</span>
          </div>
          <p className="text-xs text-gray-500">
            즉 사용자가 보는 화면은{" "}
            <Link href="/proto/input/empty" className="underline">
              입력 화면
            </Link>
            에서 끝나고, 이 아래는 빈 여백입니다.
          </p>
          <div className="h-32 border border-gray-300" />
        </div>
      </div>
    </div>
  );
}
