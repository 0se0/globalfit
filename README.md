# GlobalFit

**English** · [한국어](#한국어)

A job-application assistant that compares a job posting with your resume: skill gaps and a match score, how
to apply, and suggested rewrites of your documents. **[Live demo](https://globalfit-five.vercel.app/)**

> The demo runs on Gemini's free tier, so analysis can fail once the daily quota is used up; please try again later.
> What you enter is sent to the Gemini API, and if an analysis fails, the first 100 characters of the input may be
> sent to the developer as an error alert. Please do not enter sensitive personal information.

Next.js · TypeScript · LangGraph.js · LangChain.js · Gemini (free tier) · Vitest · GitHub Actions

It started in a company-analysis competition, where I saw people rely on AI output they could not check.
The goal: use AI, but make the result checkable.

## Engineering highlights

**1. Closed an SSRF hole in posting-URL fetching.** The server opens whatever URL a user gives it. The old
check only required `http(s)`, and I reproduced a local page being returned for `127.0.0.1`, `localhost`,
`[::1]` and `2130706433`. Non-public addresses are now blocked on the first URL and on every redirect and
sub-request ([`lib/safe-url.ts`](lib/safe-url.ts)). A
[real-Chrome script](scripts/verify-ssrf-guard.ts) tries a redirect bypass and a sub-request bypass: the
internal server is reached with the guard off, and receives 0 requests with it on.

**2. The score is code, not an LLM.** [`calculateMatch`](lib/calculate-match.ts) is a pure function: the
same input gives the same score, and required skills weigh 3x. Property-based tests check 9 properties on
13,500 random inputs (for example, adding a skill never lowers the score), and 4 deliberately broken
implementations confirm the tests catch violations.

**3. Model claims are checked in code.**
- *How to apply:* the model's answer is lowered to `unclear` unless a sentence in the posting supports it
  ([`lib/verify-submission-method.ts`](lib/verify-submission-method.ts)).
- *Rewrites:* skills not confirmed in your original resume trigger a warning if they appear in the
  generated text ([`lib/detect-leaked-stacks.ts`](lib/detect-leaked-stacks.ts)).

**4. Measured open models instead of guessing.** The production parsing prompt, run on 3 local models
against 30 postings (15 English, 15 Korean; method and limits in [`bench/`](bench/README.md)):

| Model (4-bit) | Stack F1 | Skills absent from the posting |
|---|---|---|
| Gemma 3 12B | 86.5% | 1 / 305 |
| Llama 3.1 8B | 72.1% | 25 / 398 |
| Llama 3.2 3B | 63.0% | 37 / 276 |

None of these postings states how to apply, yet the models named a method for 27–30 of them. The checker
above turned every one into `unclear`.

**Also:** a LangGraph agent (3 tools, at most 5 iterations) reviews ambiguous requirements; skill names are
matched by embedding similarity with a 0.8 threshold set from measurements (spelling variants 0.82–0.97,
different technologies 0.56–0.76); 8 serverless API routes; 93 tests run in CI.

## How it was built

The code was written with Claude Code. I designed the service, decided which proposals to adopt, and kept
finding weak points and fixing them. The agent works under a written rule file,
[`CLAUDE.md`](CLAUDE.md), which marks how each rule is enforced (code, schema, test or prompt only).

## Known limits

- **Gemini, the model the live service uses, has not been measured.** The numbers above are open models.
- The pipeline tests mock the LLM, so they check logic and error handling, not output quality.
- The rewrite check is a plain string match and relies on the model to decide what the original contains.
- SSRF: DNS rebinding and rate limiting are not handled yet.

---

### 한국어

채용 공고와 이력서를 비교해 부족한 기술과 매칭 점수, 지원 방법, 문서 수정 제안을 보여 주는 취업 지원 서비스

**[바로 써 보기](https://globalfit-five.vercel.app/)**

> 데모는 Gemini 무료 티어로 동작해서, 하루 호출 한도를 다 쓰면 분석이 실패할 수 있습니다. 그럴 때는 시간을
> 두고 다시 시도하면 됩니다. 입력한 내용은 Gemini API로 전송되고, 분석에 실패하면 입력의 앞 100자가 오류
> 알림으로 개발자에게 전달될 수 있습니다. 민감한 개인정보는 넣지 말아 주세요.

이 서비스는 기업분석 공모전에서 확인할 수 없는 AI 결과에 의존하는 모습을 보고 만들기 시작했습니다. 목표는
AI를 쓰되 결과를 확인할 수 있게 만드는 것입니다.

#### 핵심 성과

**1. 공고 URL 수집의 SSRF 취약점을 막았습니다.** 서버가 사용자가 준 주소를 대신 여는데, 기존 검사는
`http(s)`인지만 확인했습니다. `127.0.0.1`, `localhost`, `[::1]`, `2130706433` 모두 로컬 페이지가 돌아오는 것을
재현했습니다. 지금은 첫 주소와 모든 리다이렉트·하위 요청에서 비공개 주소를 차단합니다
([`lib/safe-url.ts`](lib/safe-url.ts)). [실제 Chrome 검증 스크립트](scripts/verify-ssrf-guard.ts)로 리다이렉트
우회와 하위 요청 우회를 시도하면, 방어를 끄면 내부 서버에 요청이 닿고 켜면 0건입니다.

**2. 점수는 LLM이 아니라 코드가 계산합니다.** [`calculateMatch`](lib/calculate-match.ts)는 순수 함수라 같은
입력이면 같은 점수가 나오고, 필수 스택은 3배로 셉니다. 속성 기반 테스트로 무작위 입력 13,500개에서 속성
9개를 검사하고(예: 스택이 늘면 점수가 내려가지 않습니다), 일부러 고장 낸 구현 4개를 잡아내는 것도
확인했습니다.

**3. 모델의 주장은 코드로 확인합니다.**
- *지원 방법:* 공고 문장에 근거가 없으면 모델의 답을 `unclear`로 내립니다
  ([`lib/verify-submission-method.ts`](lib/verify-submission-method.ts)).
- *문서 재구성:* 원본 이력서에서 확인되지 않은 기술이 생성문에 들어가면 경고합니다
  ([`lib/detect-leaked-stacks.ts`](lib/detect-leaked-stacks.ts)).

**4. 오픈 모델을 직접 측정했습니다.** 서비스의 공고 파싱 프롬프트를 로컬 모델 3개에 돌려 공고 30건(영문 15,
한글 15)으로 비교했습니다. 스택 추출 F1은 Gemma 3 12B 86.5%, Llama 3.1 8B 72.1%, Llama 3.2 3B 63.0%입니다.
지원 방법이 적히지 않은 이 공고들에서 모델은 27~30건에 방식을 답했고, 위의 검증기가 모두 `unclear`로
내렸습니다. 방법과 한계는 [`bench/`](bench/README.md)에 있습니다.

**그 밖:** 애매한 요구사항은 LangGraph 에이전트(도구 3개, 최대 5회)가 다시 확인합니다. 기술명은 임베딩
유사도로 통일하며 임계값 0.8은 실측으로 정했습니다(표기 변형 0.82~0.97, 다른 기술 0.56~0.76). 서버리스 API
라우트는 8개이고, 테스트 93개가 CI에서 실행됩니다.

#### 개발 방식

코드는 Claude Code로 작성했습니다. 저는 서비스를 설계하고, 제안 중 무엇을 채택할지 정하고, 부족한 부분을
찾아 고치는 과정을 반복했습니다. 에이전트는 규칙 파일 [`CLAUDE.md`](CLAUDE.md)에 따라 작업하며, 이 파일에는
규칙마다 무엇이 강제하는지(코드·스키마·테스트·프롬프트)를 표시했습니다.

#### 아직 부족한 점

- **서비스가 실제로 쓰는 Gemini는 측정하지 않았습니다.** 위 수치는 오픈 모델의 결과입니다.
- 파이프라인 테스트는 LLM을 모의 응답으로 대체하므로, 로직과 에러 처리를 확인할 뿐 출력 품질은 재지 않습니다.
- 재구성문 검사는 단순 문자열 대조이고, 원본에 무엇이 있는지의 판단은 모델에 맡깁니다.
- SSRF: DNS 재바인딩과 호출 횟수 제한은 아직 처리하지 않았습니다.

#### 사용 방법

회원가입 없이 화면의 단계를 위에서부터 채우면 됩니다.

1. **기업분석**: 회사명과 회사 관련 URL 3~5개를 넣습니다. 이 분석이 끝나야 매칭 결과를 볼 수 있습니다.
2. **채용공고**: 본문을 붙여넣거나 URL을 넣습니다.
3. **이력서**: 텍스트를 붙여넣거나 파일(`.pdf` `.docx` `.html` `.htm` `.hwp`)을 첨부합니다.
4. **자소서 · 포트폴리오**(선택)를 넣고 **매칭 결과 보기**를 누릅니다.

- **매칭 점수**: 공고가 요구하는 스택 중 내가 가진 비율입니다(필수는 3배 가중). 스택별 감점 내역을 함께
  보여 줍니다. 회사가 강조하는 스택이 필수와 겹치면 "필수"와 "기업 요구"로 나눠 표시합니다.
- **제출 방법**: 공고가 밝히지 않으면 "불명확"으로 표시합니다.
- **문서 재구성 제안**: 내 문서에 없는 기술은 본문에 넣지 않고 "개선 제안"에만 적습니다. 보유 여부는 직접
  판단하시면 됩니다.
- 가장 최근 입력과 결과 1건만 사용 중인 브라우저에 저장됩니다.
