import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifySubmissionMethod } from "@/lib/verify-submission-method";

function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

describe("verifySubmissionMethod — 근거가 있으면 모델의 답을 유지한다", () => {
  it("회사 채용 페이지에서 지원하라고 명시된 공고는 company_site를 유지한다", () => {
    expect(verifySubmissionMethod(fixture("yc-job.txt"), "company_site")).toBe("company_site");
  });

  it("영어: apply via company website", () => {
    expect(verifySubmissionMethod("Please apply through our company website.", "company_site")).toBe("company_site");
    expect(verifySubmissionMethod("To apply, visit https://jobs.example.com/123", "company_site")).toBe("company_site");
  });

  it("한글: 채용 홈페이지에서 지원", () => {
    expect(verifySubmissionMethod("자사 채용 홈페이지에서 지원해 주세요.", "company_site")).toBe("company_site");
  });

  it("이력서를 이메일 주소로 보내라고 명시되면 email을 유지한다 (영/한)", () => {
    expect(verifySubmissionMethod("Send your resume to jobs@example.com", "email")).toBe("email");
    expect(verifySubmissionMethod("이력서를 hr@example.com 으로 보내주세요.", "email")).toBe("email");
    expect(verifySubmissionMethod("Apply by email with your CV.", "email")).toBe("email");
  });

  it("채용 플랫폼에서 지원하라고 명시되면 job_platform을 유지한다 (영/한)", () => {
    expect(verifySubmissionMethod("Please apply on LinkedIn.", "job_platform")).toBe("job_platform");
    expect(verifySubmissionMethod("지원은 원티드에서 가능합니다. 원티드를 통해 지원해 주세요.", "job_platform")).toBe(
      "job_platform"
    );
  });
});

describe("verifySubmissionMethod — 근거가 없으면 unclear로 내린다", () => {
  it("지원 방법이 없는 공고에서 모델이 방식을 말하면 unclear로 내린다", () => {
    const text = fixture("job-no-submission-method.txt");
    for (const claimed of ["company_site", "job_platform", "email"] as const) {
      expect(verifySubmissionMethod(text, claimed)).toBe("unclear");
    }
  });

  it("모델이 unclear라고 했으면 근거가 있어도 올리지 않는다 (코드는 새 사실을 만들지 않는다)", () => {
    expect(verifySubmissionMethod(fixture("yc-job.txt"), "unclear")).toBe("unclear");
  });

  it("모델의 답과 다른 방식의 근거만 있으면 unclear로 내린다", () => {
    expect(verifySubmissionMethod("Please apply through our careers page at https://x.example/jobs.", "email")).toBe(
      "unclear"
    );
  });

  it("이메일을 보내지 말라는 문장은 email 근거가 아니다", () => {
    const text = "Do not email us directly — applications sent by email will not be reviewed.";
    expect(verifySubmissionMethod(text, "email")).toBe("unclear");
  });
});

describe("verifySubmissionMethod — 실제 공고에서 나온 함정 문장 (지원과 무관한 주소·문구)", () => {
  it("문의처 이메일은 지원 방법이 아니다", () => {
    expect(verifySubmissionMethod("Please contact career@example.com for other inquiries", "email")).toBe("unclear");
  });

  it("채용 서류 반환 청구용 이메일은 지원 방법이 아니다", () => {
    const text =
      "채용 서류 반환 청구를 하는 구직자는 청구서를 작성하여 이메일 (recruitingops@example.com) 로 제출하면 14일 이내에 발송해 드립니다.";
    expect(verifySubmissionMethod(text, "email")).toBe("unclear");
  });

  it("결과 안내를 지원서에 등록한 이메일로 한다는 문장은 지원 방법이 아니다", () => {
    expect(verifySubmissionMethod("전형 일정 및 결과는 지원서에 등록하신 이메일로 개별 안내 드립니다.", "email")).toBe(
      "unclear"
    );
  });

  it("장애인 편의 제공(accommodation) 요청 안내는 이메일 지원 방법이 아니다", () => {
    const text =
      "If you require a reasonable accommodation to apply for a job, please contact us via e-mail at hr@example.com or via mail at 101 Main St.";
    expect(verifySubmissionMethod(text, "email")).toBe("unclear");
  });

  it("채용 페이지 접근성 안내나 사기 주의 문구는 지원 방법이 아니다", () => {
    const text =
      "Datadog endeavors to make our Careers Page accessible to all users. Our open roles are posted on our Careers Page at careers.example.com, and recruiters write only from @example.com addresses.";
    expect(verifySubmissionMethod(text, "company_site")).toBe("unclear");
  });

  it("회사 소개의 SNS 안내(Follow us on LinkedIn)는 채용 플랫폼 지원 근거가 아니다", () => {
    expect(verifySubmissionMethod("Follow Example on LinkedIn, X, YouTube.", "job_platform")).toBe("unclear");
  });

  it("회사 소개에 나온 홈페이지는 지원 방법이 아니다", () => {
    expect(verifySubmissionMethod("쿠팡페이는 쿠팡 앱 및 홈페이지에서 상품을 구매하는 소비자에게 결제를 제공합니다.", "company_site")).toBe(
      "unclear"
    );
  });
});
