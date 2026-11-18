import { describe, expect, it } from "vitest";
import { calculateMatch, type MatchResult } from "@/lib/calculate-match";
import type { CanonicalizedStack } from "@/lib/canonicalize-stacks";

type MatchFn = (
  required: CanonicalizedStack[],
  preferred: CanonicalizedStack[],
  applicant: CanonicalizedStack[]
) => MatchResult;
type Rng = () => number;

// 시드를 고정한 난수 — 실패하면 시드와 입력을 메시지에 남겨 그대로 재현할 수 있다
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["React", "Vue.js", "Node.js", "Python", "Java", "Go", "Docker", "Kubernetes", "AWS", "SQL", "Kafka", "Swift"];

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

// 이름 풀을 작게 잡아 같은 스택이 required/preferred/지원자 사이에서 자주 겹치게 한다.
// 등록된 스택과 미등록 스택, 표기 변형(대소문자·공백)을 섞어 경계 조건을 건드린다
function genStack(rng: Rng): CanonicalizedStack {
  const name = pick(rng, NAMES);
  const raw = pick(rng, [name, name.toLowerCase(), ` ${name} `]);
  return rng() < 0.7
    ? { raw, canonical: name, registered: true }
    : { raw, canonical: null, registered: false };
}

function genList(rng: Rng, max: number): CanonicalizedStack[] {
  return Array.from({ length: Math.floor(rng() * (max + 1)) }, () => genStack(rng));
}

function genDistinctNames(rng: Rng, count: number): string[] {
  const pool = [...NAMES];
  const names: string[] = [];
  for (let i = 0; i < count; i++) names.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return names;
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const reg = (name: string): CanonicalizedStack => ({ raw: name, canonical: name, registered: true });
const upper = (s: CanonicalizedStack): CanonicalizedStack => ({
  raw: s.raw.toUpperCase(),
  canonical: s.canonical === null ? null : s.canonical.toUpperCase(),
  registered: s.registered,
});
const show = (value: unknown) => JSON.stringify(value);

interface Property {
  name: string;
  // 위반하면 설명을, 지키면 null을 반환한다
  check: (fn: MatchFn, rng: Rng) => string | null;
}

const PROPERTIES: Property[] = [
  {
    name: "점수는 0~100의 정수다",
    check: (fn, rng) => {
      const [r, p, a] = [genList(rng, 6), genList(rng, 6), genList(rng, 8)];
      const { score } = fn(r, p, a);
      return Number.isInteger(score) && score >= 0 && score <= 100 ? null : `score=${score} ${show({ r, p, a })}`;
    },
  },
  {
    name: "같은 입력이면 같은 결과이고, 입력을 바꾸지 않는다",
    check: (fn, rng) => {
      const [r, p, a] = [genList(rng, 6), genList(rng, 6), genList(rng, 8)];
      const before = show({ r, p, a });
      const first = fn(r, p, a);
      // 두 번째 호출 전에 확인해야 한다: 호출마다 입력을 뒤집는 식의 변형은 두 번 하면 원상복구돼 놓친다
      if (show({ r, p, a }) !== before) return `입력이 바뀜 ${before}`;
      const second = fn(r, p, a);
      return show(first) === show(second) ? null : `결과가 다름 ${before}`;
    },
  },
  {
    name: "지원자 스택을 추가해도 점수는 내려가지 않고 감점 항목은 늘지 않는다",
    check: (fn, rng) => {
      const [r, p, a, extra] = [genList(rng, 6), genList(rng, 6), genList(rng, 5), genList(rng, 4)];
      const base = fn(r, p, a);
      const more = fn(r, p, [...a, ...extra]);
      if (more.score < base.score) return `점수 하락 ${base.score}→${more.score} ${show({ r, p, a, extra })}`;
      if (more.deductions.length > base.deductions.length) return `감점 증가 ${show({ r, p, a, extra })}`;
      return null;
    },
  },
  {
    name: "입력 순서를 바꿔도 점수와 감점 구성은 같다",
    check: (fn, rng) => {
      const [r, p, a] = [genList(rng, 6), genList(rng, 6), genList(rng, 8)];
      const x = fn(r, p, a);
      const y = fn(shuffle(rng, r), shuffle(rng, p), shuffle(rng, a));
      const sig = (m: MatchResult) =>
        show(m.deductions.map((d) => `${d.category}:${d.points}`).sort());
      return x.score === y.score && sig(x) === sig(y) ? null : `순서에 따라 달라짐 ${show({ r, p, a })}`;
    },
  },
  {
    name: "대소문자를 바꿔도 점수와 감점 구성은 같다",
    check: (fn, rng) => {
      const [r, p, a] = [genList(rng, 6), genList(rng, 6), genList(rng, 8)];
      const x = fn(r, p, a);
      const y = fn(r.map(upper), p.map(upper), a.map(upper));
      const sig = (m: MatchResult) => show(m.deductions.map((d) => `${d.category}:${d.points}`));
      return x.score === y.score && sig(x) === sig(y) ? null : `대소문자에 따라 달라짐 ${show({ r, p, a })}`;
    },
  },
  {
    name: "공고의 모든 스택을 가지면 100점이고 감점이 없다",
    check: (fn, rng) => {
      const r = genList(rng, 6);
      const p = genList(rng, 6);
      if (r.length + p.length === 0) return null;
      const result = fn(r, p, [...r, ...p]);
      return result.score === 100 && result.deductions.length === 0 ? null : `만점 아님 ${show({ r, p, result })}`;
    },
  },
  {
    name: "감점 합이 (100 − 점수)와 반올림 오차 안에서 맞는다 (필수·우대에 같은 스택이 겹쳐도)",
    check: (fn, rng) => {
      const [r, p, a] = [genList(rng, 6), genList(rng, 6), genList(rng, 8)];
      // 공고에 스택이 하나도 없으면 점수는 0이고 깎을 항목도 없어 "잃은 점수"가 정의되지 않는다
      if (r.length + p.length === 0) return null;
      const { score, deductions } = fn(r, p, a);
      // 줄마다 반올림되므로 줄 수만큼의 오차를 허용한다
      const sum = deductions.reduce((acc, d) => acc + d.points, 0);
      const tolerance = 0.5 * (deductions.length + 1);
      return Math.abs(sum - (100 - score)) <= tolerance
        ? null
        : `합=${sum} 100-점수=${100 - score} ${show({ r, p, a })}`;
    },
  },
  {
    name: "gap_stacks는 감점 항목에서 이름 기준으로 중복 없이 앞 3개다",
    check: (fn, rng) => {
      const [r, p, a] = [genList(rng, 8), genList(rng, 8), genList(rng, 4)];
      const { gap_stacks, deductions } = fn(r, p, a);
      const seen = new Set<string>();
      const expected: string[] = [];
      for (const d of deductions) {
        const key = d.raw.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        expected.push(d.raw);
        if (expected.length === 3) break;
      }
      return show(gap_stacks) === show(expected) ? null : `gap 불일치 ${show({ r, p, a })}`;
    },
  },
  {
    name: "필수 스택 하나를 잃는 손해가 같은 개수의 우대 스택 하나를 잃는 손해보다 크다",
    check: (fn, rng) => {
      const n = 1 + Math.floor(rng() * 5);
      const names = genDistinctNames(rng, n * 2);
      const r = names.slice(0, n).map(reg);
      const p = names.slice(n).map(reg);
      const missRequired = fn(r, p, [...r.slice(1), ...p]).score;
      const missPreferred = fn(r, p, [...r, ...p.slice(1)]).score;
      return missRequired < missPreferred ? null : `필수 ${missRequired} / 우대 ${missPreferred} (n=${n})`;
    },
  },
];

function runProperty(property: Property, fn: MatchFn, iterations = 1500, seed = 20260101): string | null {
  for (let i = 0; i < iterations; i++) {
    const failure = property.check(fn, mulberry32(seed + i));
    if (failure) return `${property.name} (시드 ${seed + i}): ${failure}`;
  }
  return null;
}

describe("calculateMatch 속성 기반 테스트 — 무작위 입력 1,500개씩", () => {
  for (const property of PROPERTIES) {
    it(property.name, () => {
      expect(runProperty(property, calculateMatch)).toBeNull();
    });
  }
});

// 테스트가 정말 위반을 잡는지 확인한다: 일부러 망가뜨린 구현이 최소 하나의 속성에 걸려야 한다
describe("속성 테스트의 검출력 — 고장 낸 구현은 잡아낸다", () => {
  const mutants: { name: string; fn: MatchFn }[] = [
    {
      name: "지원자 스택이 많을수록 점수를 깎는 구현",
      fn: (r, p, a) => {
        const result = calculateMatch(r, p, a);
        return a.length > 4 ? { ...result, score: Math.max(0, result.score - 10) } : result;
      },
    },
    {
      name: "점수가 100을 넘을 수 있는 구현",
      fn: (r, p, a) => ({ ...calculateMatch(r, p, a), score: calculateMatch(r, p, a).score + 7 }),
    },
    {
      name: "입력 배열을 제자리에서 뒤집는 구현",
      fn: (r, p, a) => {
        a.reverse();
        return calculateMatch(r, p, a);
      },
    },
    {
      name: "필수/우대 가중치를 같게 취급하는 구현",
      fn: (r, p, a) => {
        const present = (s: CanonicalizedStack) => a.some((x) => (x.canonical ?? x.raw).toLowerCase() === (s.canonical ?? s.raw).toLowerCase());
        const total = r.length + p.length;
        const matched = [...r, ...p].filter(present).length;
        return { ...calculateMatch(r, p, a), score: total === 0 ? 0 : Math.round((matched / total) * 100) };
      },
    },
  ];

  for (const mutant of mutants) {
    it(`${mutant.name}을 잡아낸다`, () => {
      const caught = PROPERTIES.map((property) => runProperty(property, mutant.fn)).filter((f) => f !== null);
      expect(caught.length).toBeGreaterThan(0);
    });
  }
});
