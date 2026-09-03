import { describe, expect, it } from "vitest";
import { distillProfile, type SignalWithVector } from "@/lib/distill-profile";

const declared = { roles: ["백엔드 엔지니어"], yearsOfExperience: "3년", workStyle: "원격" };

function signal(overrides: Partial<SignalWithVector>): SignalWithVector {
  return {
    type: "stack",
    value: "React",
    strength: "strong",
    vector: [1, 0],
    ...overrides,
  };
}

describe("distillProfile", () => {
  it("유사도가 임계값 이상이면 confirmed로 킵한다", () => {
    const declaredVector = [1, 0];
    const result = distillProfile(declared, declaredVector, [
      signal({ value: "Node.js", vector: [1, 0] }),
    ]);
    expect(result.kept).toEqual([{ type: "stack", value: "Node.js", confidence: "confirmed" }]);
    expect(result.discarded).toHaveLength(0);
  });

  it("약한 반응(weak)에서 나온 신호는 유사도 미달 시 버린다", () => {
    const declaredVector = [1, 0];
    const result = distillProfile(declared, declaredVector, [
      signal({ type: "role_hint", value: "디자이너", strength: "weak", vector: [0, 1] }),
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.discarded).toEqual([{ type: "role_hint", value: "디자이너" }]);
  });

  it("강한 반응(strong)은 유사도가 낮아도 버리지 않고 weak로 표시한다", () => {
    const declaredVector = [1, 0];
    const result = distillProfile(declared, declaredVector, [
      signal({ type: "stack", value: "Photoshop", strength: "strong", vector: [0, 1] }),
    ]);
    expect(result.kept).toEqual([{ type: "stack", value: "Photoshop", confidence: "weak" }]);
    expect(result.discarded).toHaveLength(0);
  });

  it("confirmed 스택 신호를 요약 문장 맨 앞에 넣는다", () => {
    const declaredVector = [1, 0];
    const result = distillProfile(declared, declaredVector, [
      signal({ value: "React", vector: [1, 0] }),
      signal({ value: "TypeScript", vector: [1, 0] }),
    ]);
    expect(result.summary).toBe("React·TypeScript 중심 · 백엔드 엔지니어 3년 · 원격 선호");
  });

  it("신호가 하나도 없으면 선언한 프로필만으로 요약한다", () => {
    const declaredVector = [1, 0];
    const result = distillProfile(declared, declaredVector, []);
    expect(result.summary).toBe("백엔드 엔지니어 3년 · 원격 선호");
    expect(result.kept).toHaveLength(0);
  });
});
