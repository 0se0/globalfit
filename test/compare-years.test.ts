import { describe, expect, it } from "vitest";
import { compareExperienceYears } from "@/lib/compare-years";

describe("compareExperienceYears", () => {
  it("지원자 연차가 요구 연차 이상이면 meets", () => {
    expect(compareExperienceYears("3년 이상", "5년").status).toBe("meets");
  });

  it("지원자 연차가 요구 연차 미만이면 below", () => {
    expect(compareExperienceYears("5년 이상", "2년").status).toBe("below");
  });

  it("JD에 연차 요건이 없으면(빈 문자열) unclear", () => {
    const result = compareExperienceYears("", "3년");
    expect(result.status).toBe("unclear");
    expect(result.requiredMinYears).toBeNull();
  });

  it("숫자를 못 찾으면 추측하지 않고 unclear", () => {
    const result = compareExperienceYears("경력 무관", "다수");
    expect(result.status).toBe("unclear");
  });

  it("'신입'은 0년으로 취급한다", () => {
    expect(compareExperienceYears("신입", "0년").status).toBe("meets");
  });
});
