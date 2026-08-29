import { describe, expect, it } from "vitest";
import { mergeCompanyStacksIntoPreferred } from "@/lib/merge-company-stacks";
import type { CanonicalizedStack } from "@/lib/canonicalize-stacks";

function stack(raw: string, canonical: string | null = raw, registered = true): CanonicalizedStack {
  return { raw, canonical, registered };
}

describe("mergeCompanyStacksIntoPreferred", () => {
  it("기업분석을 안 했으면(undefined) JD의 preferred_stacks만 그대로 반환한다", () => {
    const jdPreferred = [stack("Docker")];
    expect(mergeCompanyStacksIntoPreferred(jdPreferred, undefined)).toEqual(jdPreferred);
  });

  it("기업분석 결과가 빈 배열이면 JD의 preferred_stacks만 그대로 반환한다", () => {
    const jdPreferred = [stack("Docker")];
    expect(mergeCompanyStacksIntoPreferred(jdPreferred, [])).toEqual(jdPreferred);
  });

  it("회사의 요구 스택을 JD의 preferred_stacks 뒤에 추가한다", () => {
    const jdPreferred = [stack("Docker")];
    const companyStacks = [stack("Kubernetes"), stack("AWS")];
    const result = mergeCompanyStacksIntoPreferred(jdPreferred, companyStacks);
    expect(result.map((s) => s.raw)).toEqual(["Docker", "Kubernetes", "AWS"]);
  });

  it("canonical 기준으로 중복되면 회사 쪽 항목은 추가하지 않는다 (JD 표기 우선)", () => {
    const jdPreferred = [stack("React.js", "React")];
    const companyStacks = [stack("React", "React"), stack("GraphQL")];
    const result = mergeCompanyStacksIntoPreferred(jdPreferred, companyStacks);
    // React는 이미 canonical "React"로 JD에 있으므로 회사 쪽 "React"는 중복 제외되고
    // GraphQL만 추가됨. JD의 원래 표기(React.js)가 그대로 유지된다
    expect(result).toEqual([stack("React.js", "React"), stack("GraphQL")]);
  });

  it("canonical이 없는(미등록) 스택은 raw 기준으로 대소문자 무시하고 중복 판정한다", () => {
    const jdPreferred = [stack("kafka", null, false)];
    const companyStacks = [stack("Kafka", null, false)];
    const result = mergeCompanyStacksIntoPreferred(jdPreferred, companyStacks);
    expect(result).toEqual([stack("kafka", null, false)]);
  });

  it("required_stacks에는 관여하지 않는다 — preferred_stacks만 받아서 preferred_stacks만 반환", () => {
    const jdPreferred = [stack("Docker")];
    const companyStacks = [stack("Terraform")];
    const result = mergeCompanyStacksIntoPreferred(jdPreferred, companyStacks);
    expect(result.every((s) => "raw" in s && "canonical" in s && "registered" in s)).toBe(true);
    expect(result).toHaveLength(2);
  });
});
