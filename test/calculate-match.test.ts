import { describe, expect, it } from "vitest";
import { calculateMatch } from "@/lib/calculate-match";
import type { CanonicalizedStack } from "@/lib/canonicalize-stacks";

function stack(raw: string, canonical: string | null = raw, registered = true): CanonicalizedStack {
  return { raw, canonical, registered };
}

describe("calculateMatch", () => {
  it("같은 스택이 required와 preferred 양쪽에 모두 없으면 gap_stacks에 한 번만 나온다", () => {
    const required = [stack("iOS")];
    const preferred = [stack("iOS"), stack("Swift")];
    const result = calculateMatch(required, preferred, []);
    expect(result.gap_stacks.filter((s) => s === "iOS")).toHaveLength(1);
  });

  it("canonical이 같으면 표기가 달라도 gap_stacks에서 중복 제거한다", () => {
    const required = [stack("React.js", "React")];
    const preferred = [stack("React", "React")];
    const result = calculateMatch(required, preferred, []);
    expect(result.gap_stacks).toHaveLength(1);
  });

  it("필수 스택이 하나 빠지면 100점에서 그만큼 감점된 deductions가 나온다", () => {
    const required = [stack("React"), stack("TypeScript")];
    const result = calculateMatch(required, [], [stack("TypeScript")]);
    expect(result.deductions).toEqual([{ raw: "React", category: "required", points: 50 }]);
    expect(result.score).toBe(50);
  });

  it("같은 스택이 required와 preferred 양쪽에 없으면 감점 내역에 필수 몫과 우대 몫이 두 줄로 나온다", () => {
    const required = [stack("iOS")];
    const preferred = [stack("iOS"), stack("Swift")];
    const result = calculateMatch(required, preferred, []);
    const ios = result.deductions.filter((d) => d.raw === "iOS");
    expect(ios.map((d) => d.category)).toEqual(["required", "preferred"]);
    expect(result.gap_stacks.filter((s) => s === "iOS")).toHaveLength(1);
  });

  it("필수와 겹친 회사 스택은 두 번 반영되고, 감점 내역의 합이 잃은 점수와 맞는다", () => {
    const required = [stack("React"), stack("Docker")];
    // 기업분석 병합 결과: 공고 우대 AWS + 회사 스택 React(필수와 겹침), Kafka
    const preferred = [stack("AWS"), stack("React"), stack("Kafka")];
    const result = calculateMatch(required, preferred, []);
    expect(result.score).toBe(0);
    expect(result.deductions).toEqual([
      { raw: "React", category: "required", points: 38 },
      { raw: "Docker", category: "required", points: 38 },
      { raw: "AWS", category: "preferred", points: 8 },
      { raw: "React", category: "preferred", points: 8 },
      { raw: "Kafka", category: "preferred", points: 8 },
    ]);
    expect(result.deductions.reduce((sum, d) => sum + d.points, 0)).toBe(100);
  });

  it("겹친 스택을 갖고 있으면 두 몫 모두 감점되지 않는다", () => {
    const required = [stack("React"), stack("Docker")];
    const preferred = [stack("AWS"), stack("React"), stack("Kafka")];
    const result = calculateMatch(required, preferred, [stack("React"), stack("Docker")]);
    expect(result.score).toBe(83);
    expect(result.deductions.map((d) => d.raw)).toEqual(["AWS", "Kafka"]);
  });

  it("같은 목록 안에서 이름이 겹치면 한 줄로 합쳐 개수만큼 감점한다", () => {
    const result = calculateMatch([stack("React"), stack("React.js", "React")], [], []);
    expect(result.deductions).toEqual([{ raw: "React", category: "required", points: 100 }]);
  });

  it("부족 스택은 감점 줄이 둘로 나뉘어도 이름 기준으로 앞 3개만 센다", () => {
    const required = [stack("A"), stack("B"), stack("C"), stack("D")];
    const preferred = [stack("A"), stack("B"), stack("E")];
    expect(calculateMatch(required, preferred, []).gap_stacks).toEqual(["A", "B", "C"]);
  });
});
