import Link from "next/link";

export const PROTO_SCREENS = [
  { key: "input", label: "① 입력", path: "/proto/input" },
  { key: "match", label: "② 매칭 결과", path: "/proto/match" },
  { key: "suggestion", label: "③ 문서 재구성 제안", path: "/proto/suggestion" },
  { key: "company", label: "④ 기업분석", path: "/proto/company" },
] as const;

export type ProtoScreenKey = (typeof PROTO_SCREENS)[number]["key"];

const STATES = [
  { key: "normal", label: "정상" },
  { key: "loading", label: "로딩" },
  { key: "empty", label: "빈 상태" },
  { key: "error", label: "에러" },
] as const;

export type ProtoStateKey = (typeof STATES)[number]["key"];

function tabClass(active: boolean) {
  return active
    ? "border border-black bg-black px-2 py-1 text-white"
    : "border border-gray-400 px-2 py-1 text-black hover:bg-gray-100";
}

export function ProtoNav({
  screen,
  state,
}: {
  screen: ProtoScreenKey;
  state: ProtoStateKey;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 border border-gray-400 bg-gray-50 p-3 text-xs">
      <div className="flex items-center justify-between">
        <Link href="/proto" className="underline">
          ← /proto 전체 목록
        </Link>
        <span className="text-gray-500">그레이스케일 프로토타입 · 가짜 데이터</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PROTO_SCREENS.map((s) => (
          <Link key={s.key} href={`${s.path}/normal`} className={tabClass(s.key === screen)}>
            {s.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATES.map((s) => (
          <Link
            key={s.key}
            href={`/proto/${screen}/${s.key}`}
            className={tabClass(s.key === state)}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
