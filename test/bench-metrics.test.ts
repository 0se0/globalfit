import { describe, expect, it } from "vitest";
import { counts, f1, makeToSet, postingCounts, yearsMin } from "@/bench/metrics";

// 실제 키워드 사전에 묶이지 않도록 테스트용 작은 사전을 쓴다
const toSet = makeToSet([
  { canonical: "React", synonyms: ["ReactJS", "React.js"] },
  { canonical: "Node.js", synonyms: ["NodeJS", "node"] },
]);

const gold = {
  required: ["React", "Python"],
  preferred: ["Docker"],
  ambiguous: ["CI/CD"],
};

describe("makeToSet — 표기 통일", () => {
  it("동의어·대소문자·앞뒤 공백을 같은 스택으로 본다", () => {
    expect(toSet(["ReactJS", " react ", "React.js"])).toEqual(new Set(["react"]));
  });

  it("사전에 없는 이름은 소문자 원문으로 남기고 다른 이름으로 바꾸지 않는다", () => {
    expect(toSet(["Rust", "리액트"])).toEqual(new Set(["rust", "리액트"]));
  });
});

describe("f1", () => {
  it("전부 맞히면 정밀도·재현율·F1이 모두 1이다", () => {
    const result = f1(counts(new Set(["a", "b"]), new Set(["a", "b"])));
    expect(result).toEqual({ precision: 1, recall: 1, f1: 1 });
  });

  it("절반만 맞히면 정밀도와 재현율이 각자 계산된다", () => {
    // 예측 4개 중 2개 적중(정밀도 0.5), 정답 2개 중 2개 적중(재현율 1)
    const result = f1(counts(new Set(["a", "b", "x", "y"]), new Set(["a", "b"])));
    expect(result.precision).toBe(0.5);
    expect(result.recall).toBe(1);
    expect(result.f1).toBeCloseTo(2 / 3);
  });

  it("정답이 있는데 하나도 못 찾으면 0이다", () => {
    expect(f1(counts(new Set(), new Set(["a"]))).f1).toBe(0);
  });
});

describe("postingCounts — 공고 한 건의 채점", () => {
  it("ambiguous 항목은 예측에 있어도 예측으로 세지 않아 감점이 없다", () => {
    const withNeutral = postingCounts(
      { required_stacks: ["React", "CI/CD"], preferred_stacks: [] },
      gold,
      toSet
    );
    const withoutNeutral = postingCounts({ required_stacks: ["React"], preferred_stacks: [] }, gold, toSet);
    expect(withNeutral.pooled).toEqual(withoutNeutral.pooled);
  });

  it("정답에도 중립에도 없는 스택은 예측으로 세어 정밀도를 낮춘다", () => {
    const result = postingCounts({ required_stacks: ["React", "Rust"], preferred_stacks: [] }, gold, toSet);
    expect(result.pooled).toEqual({ truePositive: 1, predictedSize: 2, goldSize: 3 });
  });

  it("필수를 우대로 잘못 분류하면 합쳐서 볼 때는 맞고 분류까지 볼 때는 틀린다", () => {
    const result = postingCounts({ required_stacks: ["Docker"], preferred_stacks: ["React"] }, gold, toSet);
    expect(result.pooled.truePositive).toBe(2);
    expect(result.classified.truePositive).toBe(0);
  });

  it("스키마 실패(parsed가 null)는 아무것도 못 찾은 것으로 세되 정답 개수는 그대로 둔다", () => {
    const result = postingCounts(null, gold, toSet);
    expect(result.pooled).toEqual({ truePositive: 0, predictedSize: 0, goldSize: 3 });
    expect(result.classified).toEqual({ truePositive: 0, predictedSize: 0, goldSize: 3 });
  });

  it("표기가 달라도 정답과 같은 스택이면 맞힌 것으로 센다", () => {
    const result = postingCounts({ required_stacks: ["ReactJS"], preferred_stacks: [] }, gold, toSet);
    expect(result.pooled.truePositive).toBe(1);
  });
});

describe("yearsMin", () => {
  it("문구의 첫 숫자를 최소 연차로 본다", () => {
    expect(yearsMin("3+ years")).toBe(3);
    expect(yearsMin("2-5 years")).toBe(2);
    expect(yearsMin("5~8년")).toBe(5);
  });

  it("숫자가 없거나 비어 있으면 null이다", () => {
    expect(yearsMin("신입")).toBeNull();
    expect(yearsMin("")).toBeNull();
    expect(yearsMin(undefined)).toBeNull();
  });
});
