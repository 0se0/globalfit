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

  it("required와 preferred 양쪽에 같은 스택이 없으면 deductions에도 한 번만, required로 분류된다", () => {
    const required = [stack("iOS")];
    const preferred = [stack("iOS"), stack("Swift")];
    const result = calculateMatch(required, preferred, []);
    const iosDeductions = result.deductions.filter((d) => d.raw === "iOS");
    expect(iosDeductions).toHaveLength(1);
    expect(iosDeductions[0].category).toBe("required");
  });
});
