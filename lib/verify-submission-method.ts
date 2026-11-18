export type SubmissionMethod = "company_site" | "job_platform" | "email" | "unclear";
type ClaimedMethod = Exclude<SubmissionMethod, "unclear">;

// 문장 단위로 근거를 찾는다. "이메일 주소가 있으면 email" 식으로 단순하게 보면 문의처·서류 반환
// 청구용 주소 같은 지원과 무관한 주소에 속으므로, 지원 행위(보내다·제출·apply)와 같은 문장에 있을
// 때만 근거로 인정한다
const SENTENCE_SPLIT = /\n+|(?<=[.!?。])\s+/;

const EMAIL_ADDRESS = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const NOT_AN_APPLICATION = /inquir|question|accommodation|feedback|privacy|unsubscribe|문의|질문|개인정보|반환|청구/i;

const EMAIL_SEND_EN =
  /\b(send|submit|forward|e-?mail|mail)\b[^.]{0,80}\b(resume|cv|application|portfolio)\b/i;
// 한국어는 "이력서를 주소로 보내주세요" 어순이라 문서명과 동사 사이에 점이 든 이메일 주소가 온다.
// 이미 문장 단위로 잘랐으므로 여기서는 [^.] 대신 .을 쓴다
const EMAIL_SEND_KO = /(이력서|지원서|입사\s*지원|포트폴리오|경력기술서|자기소개서).{0,40}(보내|송부|제출|접수)/;
const APPLY_BY_EMAIL = /\bapply\b[^.]{0,30}\b(by|via|through)\b[^.]{0,15}\be-?mail/i;
const APPLY_BY_EMAIL_KO = /(이메일|e-?mail)\s*(로|으로)\s*(지원|접수)/i;

const SITE_EN = [
  /\bapply\b[^.]{0,40}\b(through|via|at|on|using|from)\b[^.]{0,40}\b(our|the|company'?s?)\b[^.]{0,20}\b(page|site|website|portal)\b/i,
  /\bapply\b[^.]{0,30}https?:\/\/\S+/i,
  /https?:\/\/\S+[^.]{0,40}\bto apply\b/i,
];
const SITE_KO =
  /(홈페이지|채용\s*(페이지|사이트|홈페이지)|공식\s*(홈페이지|사이트)|자사\s*(홈페이지|사이트))[^.]{0,15}(에서|로|를\s*통해)[^.]{0,10}(지원|접수)/;

const PLATFORMS_EN = "linkedin|indeed|glassdoor|wellfound|angellist|wanted|jobkorea|saramin|jumpit|programmers|rocketpunch";
const PLATFORMS_KO = "원티드|사람인|잡코리아|점핏|프로그래머스|리멤버|로켓펀치";
const PLATFORM_EN = new RegExp(
  `\\bapply\\b[^.]{0,40}\\b(on|via|through|at|using)\\b[^.]{0,20}\\b(${PLATFORMS_EN})\\b`,
  "i"
);
const PLATFORM_KO = new RegExp(`(${PLATFORMS_KO})[^.]{0,15}(에서|로|를\\s*통해)[^.]{0,10}(지원|접수)`);

function methodsSupportedBy(jdText: string): Set<ClaimedMethod> {
  const supported = new Set<ClaimedMethod>();
  for (const sentence of jdText.split(SENTENCE_SPLIT)) {
    if (!sentence.trim()) continue;
    const hasAddress = EMAIL_ADDRESS.test(sentence);
    if (
      APPLY_BY_EMAIL.test(sentence) ||
      APPLY_BY_EMAIL_KO.test(sentence) ||
      (hasAddress &&
        !NOT_AN_APPLICATION.test(sentence) &&
        (EMAIL_SEND_EN.test(sentence) || EMAIL_SEND_KO.test(sentence)))
    ) {
      supported.add("email");
    }
    if (SITE_EN.some((pattern) => pattern.test(sentence)) || SITE_KO.test(sentence)) {
      supported.add("company_site");
    }
    if (PLATFORM_EN.test(sentence) || PLATFORM_KO.test(sentence)) {
      supported.add("job_platform");
    }
  }
  return supported;
}

// 모델이 말한 지원 방법이 공고 본문의 근거와 일치할 때만 통과시킨다. 모델이 "unclear"라고 했거나
// 근거를 못 찾으면 "unclear"로 내린다. 근거가 있는데 모델이 unclear라고 한 경우는 올리지 않는다:
// 코드가 새로운 사실을 만들어 내지 않고 모델의 주장을 확인만 하는 구조로 두기 위함 (하드 룰 7번)
export function verifySubmissionMethod(jdText: string, claimed: SubmissionMethod): SubmissionMethod {
  if (claimed === "unclear") return "unclear";
  return methodsSupportedBy(jdText).has(claimed) ? claimed : "unclear";
}
