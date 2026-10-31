import { describe, expect, it } from "vitest";
import { findLeakedStacks } from "@/lib/detect-leaked-stacks";

describe("findLeakedStacks", () => {
  it("재구성 본문에 원본에서 확인되지 않은 기술명이 있으면 그 기술을 반환한다", () => {
    const texts = ["2년간 React 대시보드를 만들고 Docker 배포를 담당했습니다."];
    expect(findLeakedStacks(texts, ["Docker", "AWS"])).toEqual(["Docker"]);
  });

  it("본문에 없으면 빈 배열을 반환한다", () => {
    expect(findLeakedStacks(["React로 대시보드를 만들었습니다."], ["Docker", "AWS"])).toEqual([]);
  });

  it("대소문자를 구분하지 않는다", () => {
    expect(findLeakedStacks(["worked with kubernetes daily"], ["Kubernetes"])).toEqual(["Kubernetes"]);
  });

  it("다른 기술 이름의 일부는 잡지 않는다 (Java vs JavaScript)", () => {
    expect(findLeakedStacks(["JavaScript와 TypeScript로 개발했습니다."], ["Java"])).toEqual([]);
    expect(findLeakedStacks(["Java와 JavaScript로 개발했습니다."], ["Java"])).toEqual(["Java"]);
  });

  it("C++, C#, Node.js처럼 특수문자가 들어간 이름도 정확히 비교한다", () => {
    const texts = ["C++ 엔진과 C# 툴, Node.js 서버를 다뤘습니다."];
    expect(findLeakedStacks(texts, ["C++", "C#", "Node.js", "Go"])).toEqual(["C++", "C#", "Node.js"]);
    expect(findLeakedStacks(["Node.jsx 컴포넌트"], ["Node.js"])).toEqual([]);
  });

  it("한글 조사가 바로 붙어 있어도 잡는다", () => {
    expect(findLeakedStacks(["Kubernetes를 운영했습니다."], ["Kubernetes"])).toEqual(["Kubernetes"]);
  });

  it("여러 본문 중 하나에만 있어도 잡고, 같은 기술은 한 번만 반환한다", () => {
    const texts = ["이력서 본문", "자소서에서 AWS를 언급합니다. AWS는 중요합니다."];
    expect(findLeakedStacks(texts, ["AWS", "AWS"])).toEqual(["AWS"]);
  });

  it("본문이나 대상 목록이 비어 있으면 빈 배열을 반환한다", () => {
    expect(findLeakedStacks([], ["Docker"])).toEqual([]);
    expect(findLeakedStacks(["", "  "], ["Docker"])).toEqual([]);
    expect(findLeakedStacks(["Docker"], [])).toEqual([]);
    expect(findLeakedStacks(["Docker"], ["  "])).toEqual([]);
  });
});
