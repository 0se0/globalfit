import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { retryOnce } from "@/lib/retry-once";
import { reportFailure } from "@/lib/report-failure";

export const maxDuration = 30;

const GEMINI_MODEL = "gemini-3.6-flash";

// 링크를 직접 주려면 검색 API/grounding이 필요해 무료 티어 천장 문제를 또
// 만든다(기업분석 grounding이 겪었던 것과 같은 리스크). 검색어만 생성하면
// 외부 API 없이 코드만으로 되고, 링크 썩음 관리도 필요 없다
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    guides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stack: { type: Type.STRING },
          search_queries: { type: Type.ARRAY, items: { type: Type.STRING } },
          why: { type: Type.STRING },
        },
        required: ["stack", "search_queries", "why"],
      },
    },
  },
  required: ["guides"],
};

const RULES = `Follow these rules exactly:
- Produce exactly one guide item per stack listed under "Gap stacks" below, in the same order, using the exact stack name given (do not translate or localize it).
- search_queries: 2-3 concrete search query strings the applicant can paste directly into Google or YouTube to start learning this stack (e.g. "GraphQL 공식 튜토리얼", "GraphQL vs REST 차이"). Write them in Korean unless the stack conventionally has English-first documentation search terms.
- NEVER output a URL, a specific course/channel/book name, or claim that a specific resource exists — you only generate search terms, not sources. Do not invent creator names or link titles.
- why: one short sentence (in Korean) on why this stack matters for the target role, grounded only in the job's stack list given below. If no job stacks are given, a short generic sentence about why the stack is commonly asked for is fine — do not invent a specific company or project context.
- Output entirely in Korean, except technology/stack names which must stay in their original form (e.g. "React", not "리액트").`;

const PROMPT = `You are creating self-study search guidance for a job applicant who is missing certain technology stacks required by a job posting. ${RULES}

Job's required/preferred stacks (for context on why each gap matters, may be empty):
{{JOB_STACKS}}

Gap stacks (the applicant is missing these):
{{GAP_STACKS}}`;

interface GapGuideItem {
  stack: string;
  search_queries: string[];
  why: string;
}

interface GeminiGapGuideOutput {
  guides: GapGuideItem[];
}

export async function POST(request: Request) {
  const { gapStacks, jobStacks } = (await request.json()) as {
    gapStacks?: string[];
    jobStacks?: string[];
  };

  if (!gapStacks || gapStacks.length === 0) {
    return NextResponse.json({ error: "empty_gap_stacks" }, { status: 400 });
  }

  const prompt = PROMPT.replace("{{JOB_STACKS}}", (jobStacks ?? []).join(", ") || "(none)").replace(
    "{{GAP_STACKS}}",
    gapStacks.join(", ")
  );

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const parsed = await retryOnce(async () => {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      return JSON.parse(response.text ?? "") as GeminiGapGuideOutput;
    });

    return NextResponse.json(parsed);
  } catch (error) {
    await reportFailure(gapStacks.join(", "), error);
    return NextResponse.json({ error: "gap_guide_failed" }, { status: 500 });
  }
}
