import Link from "next/link";

export default function ProtoIndex() {
  return (
    <div className="min-h-screen bg-white p-6 text-sm text-black">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <p className="text-xs text-gray-500">GlobalFit · 그레이스케일 프로토타입</p>
          <h1 className="text-lg font-semibold">플로우 3개 · 화면 순서</h1>
          <p className="mt-1 text-xs text-gray-500">
            가짜 데이터로 채운 클릭 가능한 프로토타입입니다. API 연결 없음.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="border border-gray-400 p-4">
            <p className="mb-2 font-semibold">플로우 1 — 텍스트 기반 기본 매칭</p>
            <p className="mb-3 text-xs text-gray-500">
              국내/해외 공고 1건을 텍스트로 준비한 취업준비생
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/proto/input/normal" className="border border-gray-400 p-2 hover:bg-gray-50">
                ① 입력 (텍스트/URL 붙여넣기)
              </Link>
              <div className="text-center text-gray-400">↓</div>
              <Link href="/proto/match/normal" className="border border-gray-400 p-2 hover:bg-gray-50">
                ② 매칭 결과
              </Link>
              <div className="text-center text-gray-400">↓</div>
              <Link href="/proto/suggestion/normal" className="border border-gray-400 p-2 hover:bg-gray-50">
                ③ 문서 재구성 제안
              </Link>
            </div>
          </div>

          <div className="border border-gray-400 p-4">
            <p className="mb-2 font-semibold">플로우 2 — 파일 업로드 + 자소서/포트폴리오</p>
            <p className="mb-3 text-xs text-gray-500">
              공고 URL + 이력서 파일(PDF/DOCX/HTML) + 자소서·포트폴리오 텍스트
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/proto/input/normal" className="border border-gray-400 p-2 hover:bg-gray-50">
                ① 입력 — URL 가져오기 → 파일 업로드 → 자소서/포트폴리오 → 제출
              </Link>
              <div className="text-center text-gray-400">↓</div>
              <Link href="/proto/match/normal" className="border border-gray-400 p-2 hover:bg-gray-50">
                ② 매칭 결과
              </Link>
              <div className="text-center text-gray-400">↓</div>
              <Link href="/proto/suggestion/normal" className="border border-gray-400 p-2 hover:bg-gray-50">
                ③ 이력서+자소서+포트폴리오 재구성 제안 + 면접질문
              </Link>
            </div>
          </div>

          <div className="border border-gray-400 p-4">
            <p className="mb-2 font-semibold">플로우 3 — 기업분석 단독</p>
            <p className="mb-3 text-xs text-gray-500">아직 지원 안 했고 관심 회사를 미리 조사</p>
            <div className="flex flex-col gap-2">
              <Link href="/proto/company/empty" className="border border-gray-400 p-2 hover:bg-gray-50">
                기업분석 (회사명/직무 입력)
              </Link>
              <div className="text-center text-gray-400">↓</div>
              <Link href="/proto/company/normal" className="border border-gray-400 p-2 hover:bg-gray-50">
                기업분석 (리포트 — 같은 화면에서 이어서)
              </Link>
            </div>
            <p className="mt-3 border-t border-gray-300 pt-2 text-xs text-gray-500">
              라우트: 메인 <span className="font-mono">/</span> · 기업분석{" "}
              <span className="font-mono">/company-analysis</span> (실제 배포 라우트 이름 기준.
              이 프로토타입 자체는 <span className="font-mono">/proto</span> 아래에 격리되어 있음)
            </p>
          </div>
        </div>

        <div className="border border-gray-400 p-4">
          <p className="mb-2 font-semibold">화면별 4가지 상태 바로가기</p>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                <th className="border border-gray-300 p-1.5">화면</th>
                <th className="border border-gray-300 p-1.5">정상</th>
                <th className="border border-gray-300 p-1.5">로딩</th>
                <th className="border border-gray-300 p-1.5">빈 상태</th>
                <th className="border border-gray-300 p-1.5">에러</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: "input", label: "① 입력" },
                { key: "match", label: "② 매칭 결과" },
                { key: "suggestion", label: "③ 문서 재구성 제안" },
                { key: "company", label: "④ 기업분석" },
              ].map((row) => (
                <tr key={row.key}>
                  <td className="border border-gray-300 p-1.5">{row.label}</td>
                  {["normal", "loading", "empty", "error"].map((s) => (
                    <td key={s} className="border border-gray-300 p-1.5">
                      <Link href={`/proto/${row.key}/${s}`} className="underline">
                        보기
                      </Link>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
