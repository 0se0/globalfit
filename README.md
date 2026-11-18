# GlobalFit

## English summary

**GlobalFit** is a job-application assistant for job seekers. Paste a job posting and a resume (cover letter and portfolio are optional) and it returns a skill-gap analysis, how to submit, tailored document suggestions, and before/after match scores. It is built with Next.js, TypeScript, LangChain.js and LangGraph.js, using the Gemini API on the free tier.

It started when I saw teammates in a company-analysis competition rely on AI output they could not verify. The goal became: use AI, but make the result checkable.

- **Deterministic scoring, not an LLM.** The match score comes from a pure function ([`lib/calculate-match.ts`](lib/calculate-match.ts)), so the same input always gives the same score. Required skills are weighted 3x, and the original / improved / potential scores all reuse this one function.
- **Guards against made-up content.** If a posting does not say how to apply, the field is `"unclear"` instead of a guess, and code ([`lib/verify-submission-method.ts`](lib/verify-submission-method.ts)) lowers the model's answer to `"unclear"` unless a sentence in the posting ties that method to applying. Skills missing from the original resume are kept out of the rewritten text and listed only in a separate suggestions section marked "you decide whether you have this". These rules are enforced in the prompts. After generation, a code-level check ([`lib/detect-leaked-stacks.ts`](lib/detect-leaked-stacks.ts)) scans the rewritten resume, cover letter, portfolio and suggested edits for any skill that was not confirmed in the original, and shows a warning if one slipped in. It only warns and never edits the text, so the user stays the one who decides.
- **A measured similarity threshold.** Skill names are normalized by embedding similarity against an in-memory keyword index, and English names are never translated. The 0.8 threshold was set from measurements: spelling variants of the same technology scored 0.82–0.97, while different technologies with similar names (e.g. Java vs JavaScript) scored 0.56–0.76.
- **A small, capped agent.** A LangGraph agent with three tools, hard-capped at five iterations, reviews ambiguous requirements. A code-level gate skips it entirely when a posting shows no ambiguity signals.
- **Working within a free-tier quota.** After hitting Gemini's limit of 20 calls per day, I merged the two-step PDF flow (extract text, then structure it) into one multimodal call, which cut a PDF resume from 44 s to 7.3 s in a measured run ([`app/api/parse-applicant/route.ts`](app/api/parse-applicant/route.ts)).
- **Fetching untrusted URLs safely.** The posting fetch opens a headless browser on whatever URL the user gives, so it blocks non-public targets (loopback, private ranges, cloud metadata, alternate IP spellings, IPv6 forms) on the first URL and on every redirect and sub-request ([`lib/safe-url.ts`](lib/safe-url.ts)). I reproduced the problem first (the old route returned the local server's page for four loopback spellings), then checked the fix with a real Chrome that follows redirects ([`scripts/verify-ssrf-guard.ts`](scripts/verify-ssrf-guard.ts)). DNS rebinding and rate limiting are known gaps.
- **Failure handling and tests.** There are eight serverless API routes; six of the seven LLM-calling routes retry once and send an optional Discord webhook alert on failure. 80 Vitest tests (`npm test`) cover pure-function logic (76) and the pipeline with the LLM mocked (4), so they check orchestration, scoring and error handling rather than the model's real output quality. The score function also has property-based tests: random inputs check invariants such as "adding a skill never lowers the score", and deliberately broken implementations confirm the tests catch violations.

### How this was built with AI coding tools

The code was written with Claude Code (Anthropic's coding agent). My part was deciding what to build, writing the rules it must follow, reviewing its output against those rules, and counting work as done only when the agreed checks pass.

- [`CLAUDE.md`](CLAUDE.md) is the rule file Claude Code loads at the start of every session. It fixes the stack, the hard rules (for example: the match score must never be computed by an LLM; never add facts that are not in the source document; free-tier services only; no changes outside the requested scope), and the definition of "done" as automated checks.
- The file is written in Korean, and a few references in it point to private planning notes that are not part of this repository.

*The Korean documentation follows.*

---

취업 준비생을 위한 지원 과정 비서. 채용 공고와 이력서(+자소서·포트폴리오)를 넣으면
**기술 갭 분석 · 제출 방법 · 문서 맞춤 재구성 · 개선 전후 점수**를 한 번에 얻는다.

> 국내·글로벌 원격 테크 기업에 지원하며, 공고마다 다른 요구 역량·제출 방식·필요 서류를
> 매번 손으로 대조하던 반복 작업을 한 곳에서 처리하려고 만들었다.

---

## 왜 만들었나

기업분석 공모전에서 팀원들이 검증할 수 없는 AI 분석 결과에 의존하는 모습을 보고, AI를
쓰면서도 결과를 검증할 수 있는 도구를 직접 만들어 보기로 했다.

기업분석 공모전에 참여하며 이 도구로 실제 기업분석과 취업 로드맵을 작성했고, 그 결과로
수상했다. 이후 "요즘 AI로 취준 문서를 비교하는 도구는 많은데, **조금이라도 더 정확하게**
분석하는 걸 만들 수 있을까"라는 질문으로 계속 발전시키고 있다.

## 다른 도구와 무엇이 다른가

일반적인 "AI 이력서 첨삭 / 매칭" 도구가 *그럴듯함*을 최적화한다면, GlobalFit은
**틀리지 않음을 구조로 보장하는 것**에 무게를 둔다.

### 1. 매칭 점수는 LLM이 아니라 결정론적 코드로 계산한다

[`lib/calculate-match.ts`](lib/calculate-match.ts) — 순수 함수. LLM 호출이 없다.
필수 스택 3배 가중치가 코드에 상수로 고정돼 있고, **같은 입력이면 항상 같은 점수**가
나온다. 원본 / 개선 후 / 잠재 최대 세 점수 모두 이 함수 하나를 재사용한다.
스택 하나가 빠질 때 몇 점이 깎이는지도 함께 보여준다(`deductions`).

### 2. 지어낸 내용은 규칙으로 제한하고, 새어 나왔는지는 코드가 검사한다

- 공고에 지원 방법이 명시돼 있지 않으면 `"unclear"` — 추측하지 않도록 프롬프트로 규정하고,
  모델이 답한 지원 방법이 공고 본문의 지원 문장과 맞지 않으면 코드
  ([`lib/verify-submission-method.ts`](lib/verify-submission-method.ts))가 `unclear`로 내린다.
  코드는 내리기만 하고 올리지는 않는다(모델의 주장을 확인할 뿐 새 사실을 만들지 않는다)
- 원본 서류에 없는 항목은 재구성문 본문에 넣지 않도록 프롬프트 규칙으로 못 박고,
  별도 "개선 제안서"에 "보유 여부는 사용자가 직접 판단" 문구와 함께만 기록한다
- 생성 후에는 코드가 재구성문(이력서·자소서·포트폴리오·첨삭 대체 문구)에 그 항목이
  들어갔는지 검사해, 들어갔으면 화면에 경고한다
  ([`lib/detect-leaked-stacks.ts`](lib/detect-leaked-stacks.ts)). 경고만 하고 본문은 고치지
  않는다 — 판단은 사용자가 한다 (`npm test`: 검사 단위 테스트 + 모킹된 응답 기준 문자열 검색)
- 문서 "다듬기"의 허용 범위가 [`suggest-resume`](app/api/suggest-resume/route.ts)의
  프롬프트 규칙에 못 박혀 있다: 재배열·동의어 교체·강조 이동은 허용, 새 사실 추가는 금지

### 3. 영문 공고의 스택명을 한글로 바꾸지 않는다

[`lib/canonicalize-stacks.ts`](lib/canonicalize-stacks.ts) — 벡터 유사도로
`React / ReactJS / React.js → React`처럼 동의어만 통일한다. `React`가 `리액트`가
되지 않고, 사전에 없는 스택명은 원문 그대로 두고 "미등록"으로 표시한다. 글로벌·원격
공고를 대조할 때 용어 의역이 만드는 오차를 없앤다. 유사도 임계값(0.8)은 감으로 정하지
않고 실측으로 보정했다: 진짜 표기 변형(예: `react-native`)은 0.82~0.97, 이름만 비슷한
서로 다른 기술(예: Java vs JavaScript)은 0.56~0.76 — 이 갭을 보고 0.8로 설정했다.

### 4. 기업분석을 매칭의 전제 단계로 둔다

회사를 이해하지 않고 지원하는 습관을 강화하지 않으려고, **기업분석을 완료해야만
매칭 점수를 볼 수 있다.** 리포트는 고정된 프레임워크(기업 정보 · 사업 분석 · 직무 이해 ·
환경 분석(SWOT·PEST·TOWS) · 채용 전략·로드맵)를 따르므로, "이 회사 분석 결과"를 얻는
동시에 "기업분석은 이렇게 하는 것"이라는 틀을 함께 가져간다. 회사 자료에 없는 항목
(하루 일과, 3·5·7년 뒤 업무 범위 변화 등)은 지어내지 않고 "직접 조사하는 법"을 안내한다.
분석에서 나온 "그 회사의 반복 요구 스택"은 매칭 점수의 우대 스택에 반영된다. 필수 스택과 겹치면 한 번 더
반영되며(회사가 강조하는 만큼 가산), 감점 내역에 "필수"와 "기업 요구" 두 줄로 나뉘어 표시돼 합계가
잃은 점수와 맞는다.

### 5. 무료 티어 제약을 기능 축소가 아니라 구조 개선으로 해결한다

Gemini 무료 티어의 `generateContent` 일일 호출 한도(20회/일, 롤링 윈도우)에 막혔을 때,
기능을 줄이는 대신 파이프라인을 다시 뜯어봤다. PDF 이력서 처리를 텍스트 추출(1회
호출) → 구조화(1회 호출) 2단계에서, PDF를 구조화 프롬프트와 함께 바로 보내는 1회
호출로 합쳤다. 호출 횟수가 줄면서 처리 시간도 **44초 → 7.3초**로 단축됐다
(구현은 [`app/api/parse-applicant/route.ts`](app/api/parse-applicant/route.ts) 참고).
애매함 신호(우대/선호 문구, 미등록 스택)가 전혀 없는 공고는 판단 지점 에이전트
자체를 호출하지 않는 필터(`shouldRunJudgeAgent`)도 같은 이유로 추가했다.

### 6. 사용자가 준 URL을 서버가 여는 기능은 내부 주소 접근을 막는다

공고 URL을 넣으면 서버가 헤드리스 브라우저로 그 주소를 연다. 그대로 두면 서버 자신이나 내부망
주소를 대신 읽어 오게 만들 수 있어서(SSRF), 첫 주소와 모든 리다이렉트·하위 요청에서 내부·사설·
메타데이터 주소와 우회 표기(`2130706433`, `[::ffff:7f00:1]` 등)를 막는다
([`lib/safe-url.ts`](lib/safe-url.ts)). 먼저 문제를 재현하고(기존 라우트가 루프백 4가지 표기로
로컬 서버의 페이지를 돌려줌) 수정한 뒤, 진짜 Chrome으로 리다이렉트 우회가 막히는지 확인했다.
DNS 재바인딩과 호출 횟수 제한은 아직 막지 못한다.

## 동작 방식

```
입력(공고 · 이력서 · 자소서 · 포트폴리오)
  → 기업분석 (사용자 제공 URL 기반, grounding)
  → 공고 파싱 · 이력서 파싱 (구조화 JSON)
  → 판단 지점 에이전트 (LangGraph, 도구 3개, 최대 5회)
  → calculateMatch (순수 코드, LLM 없음)
  → 문서 재구성 제안 + 개선/잠재 점수 + 면접 꼬리질문
```

숫자가 나오는 부분은 항상 코드가, 나머지는 LLM이 담당한다는 경계가 명확하게 그어져 있다.
외부 LLM 호출은 모킹하고, 오케스트레이션·점수 계산·에러 처리 로직을 자동 테스트로
매번 검증한다([`test/e2e.test.ts`](test/e2e.test.ts), `npm test -- e2e`).

## 기술 스택

- **Next.js + TypeScript** — Vercel 네이티브 배포, 별도 백엔드·DB 없음
- **LangGraph.js** — 판단 지점(도구 선택 + 반복)의 상태·분기를 StateGraph로 관리
- **LangChain.js** — 3곳의 LLM 호출을 표준 컴포넌트로 통일
- **RAG (인메모리 벡터스토어)** — 키워드 사전을 하드코딩 대신 임베딩 유사도로,
  세션마다 즉석 생성
- LLM: 무료 티어 모델만 사용

## AI 코딩 도구 사용 방식

코드는 Claude Code(AI 코딩 에이전트)로 작성했고, 저는 무엇을 어떤 규칙으로 만들지 정하고
결과를 그 규칙에 비춰 검수했다. 에이전트가 매 세션 읽는 규칙 파일은 [`CLAUDE.md`](CLAUDE.md)이며,
작업의 "완료"는 `npm test` 통과로 정의했다.

## 범위

- 1개 공고 vs 1개 이력서 세트 (여러 공고를 나란히 비교하는 기능은 없음)
- 결과는 브라우저 로컬에 최근 1건만 유지 (서버 저장 없음, 로그인 없음)
