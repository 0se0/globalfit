import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { retryOnce } from "@/lib/retry-once";
import { reportFailure } from "@/lib/report-failure";
import { canonicalizeStacks, type CanonicalizedStack } from "@/lib/canonicalize-stacks";

export const maxDuration = 60;

const GEMINI_MODEL = "gemini-3.6-flash";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    company_info: {
      type: Type.OBJECT,
      properties: {
        general: { type: Type.STRING },
        mission_vision: { type: Type.STRING },
        tech_capability: { type: Type.STRING },
      },
      required: ["general", "mission_vision", "tech_capability"],
    },
    business_analysis: {
      type: Type.OBJECT,
      properties: {
        business_areas: { type: Type.STRING },
        recent_news: { type: Type.STRING },
        financials: { type: Type.STRING },
        org_roles: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["business_areas", "recent_news", "financials", "org_roles"],
    },
    environment_analysis: {
      type: Type.OBJECT,
      properties: {
        industry_trends: { type: Type.STRING },
        competitors: { type: Type.STRING },
        swot: {
          type: Type.OBJECT,
          properties: {
            strengths: { type: Type.STRING },
            weaknesses: { type: Type.STRING },
            opportunities: { type: Type.STRING },
            threats: { type: Type.STRING },
          },
          required: ["strengths", "weaknesses", "opportunities", "threats"],
        },
      },
      required: ["industry_trends", "competitors", "swot"],
    },
    job_strategy: {
      type: Type.OBJECT,
      properties: {
        recent_postings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["title", "stacks"],
          },
        },
        roadmap: { type: Type.STRING },
      },
      required: ["recent_postings", "roadmap"],
    },
  },
  required: ["company_info", "business_analysis", "environment_analysis", "job_strategy"],
};

const RULES = `Follow these rules exactly:
- Base every fact ONLY on the source materials given below. Never invent or guess a fact, number, article, posting, or competitor name that isn't actually present in the source materials.
- If a field isn't covered by the source materials, return an empty string "" (or empty array [] for array fields) for that field instead of guessing. Do not pad with generic filler text.
- financials: summarize only what the source materials actually state about revenue/profit/loss. If nothing is mentioned, return "".
- recent_postings: list job postings mentioned in the source materials, with the title and the technology/skill stack names literally mentioned in that posting. If none are found, return an empty array.
- org_roles: at least 3 real job functions/departments mentioned in the source materials, if present.
- roadmap: a concrete job-prep roadmap (activities, certifications, side projects, skills to build) for someone targeting {{ROLE}} at this company, grounded in what the source materials reveal about the company's needs.
- Output entirely in Korean, except technology/stack names which must stay in their original form (e.g. "React", not "리액트") — do not translate or localize stack names.`;

const PROMPT_WITH_CONTEXT = `You are writing a company analysis report for a job-seeker, based only on the source materials below. ${RULES}

Company: {{COMPANY_NAME}}
Role of interest: {{ROLE}}

This job-seeker has already been matched against a specific job posting requiring these stacks:
Required: {{REQUIRED_STACKS}}
Preferred: {{PREFERRED_STACKS}}
When writing the roadmap, reference this context to make it specific to their situation (e.g. which of these stacks to prioritize learning, given what the company's other postings ask for).

Source materials:
{{SOURCE_TEXTS}}`;

const PROMPT_STANDALONE = `You are writing a company analysis report for a job-seeker, based only on the source materials below. ${RULES}

Company: {{COMPANY_NAME}}
Role of interest: {{ROLE}}

Source materials:
{{SOURCE_TEXTS}}`;

interface GeminiCompanyOutput {
  company_info: {
    general: string;
    mission_vision: string;
    tech_capability: string;
  };
  business_analysis: {
    business_areas: string;
    recent_news: string;
    financials: string;
    org_roles: string[];
  };
  environment_analysis: {
    industry_trends: string;
    competitors: string;
    swot: {
      strengths: string;
      weaknesses: string;
      opportunities: string;
      threats: string;
    };
  };
  job_strategy: {
    recent_postings: { title: string; stacks: string[] }[];
    roadmap: string;
  };
}

export interface CompanyReport {
  company_info: GeminiCompanyOutput["company_info"];
  business_analysis: GeminiCompanyOutput["business_analysis"];
  environment_analysis: GeminiCompanyOutput["environment_analysis"];
  job_strategy: GeminiCompanyOutput["job_strategy"] & {
    personalized: boolean;
    aggregated_stacks: CanonicalizedStack[];
  };
  sources: { title: string; url: string }[];
}

export async function POST(request: Request) {
  const { companyName, roleOfInterest, jobContext, sourceTexts } = (await request.json()) as {
    companyName?: string;
    roleOfInterest?: string;
    jobContext?: { requiredStacks: string[]; preferredStacks: string[] };
    sourceTexts?: { url: string; text: string }[];
  };

  if (!companyName || !companyName.trim()) {
    return NextResponse.json({ error: "empty_company_name" }, { status: 400 });
  }

  if (!sourceTexts || sourceTexts.length === 0) {
    return NextResponse.json({ error: "no_source_texts" }, { status: 400 });
  }

  const role = roleOfInterest?.trim() || "관심 직무 미지정 (회사 전반)";
  const sourceTextsBlock = sourceTexts
    .map((source, i) => `[Source ${i + 1}: ${source.url}]\n${source.text}`)
    .join("\n\n");
  const prompt = jobContext
    ? PROMPT_WITH_CONTEXT.replace("{{COMPANY_NAME}}", companyName)
        .replace(/{{ROLE}}/g, role)
        .replace("{{REQUIRED_STACKS}}", jobContext.requiredStacks.join(", ") || "(none)")
        .replace("{{PREFERRED_STACKS}}", jobContext.preferredStacks.join(", ") || "(none)")
        .replace("{{SOURCE_TEXTS}}", sourceTextsBlock)
    : PROMPT_STANDALONE.replace("{{COMPANY_NAME}}", companyName)
        .replace(/{{ROLE}}/g, role)
        .replace("{{SOURCE_TEXTS}}", sourceTextsBlock);

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

      return JSON.parse(response.text ?? "") as GeminiCompanyOutput;
    });

    const rawCompanyStacks = Array.from(
      new Set(parsed.job_strategy.recent_postings.flatMap((posting) => posting.stacks))
    );
    const aggregated_stacks = await canonicalizeStacks(rawCompanyStacks);

    const result: CompanyReport = {
      company_info: parsed.company_info,
      business_analysis: parsed.business_analysis,
      environment_analysis: parsed.environment_analysis,
      job_strategy: {
        ...parsed.job_strategy,
        personalized: !!jobContext,
        aggregated_stacks,
      },
      sources: sourceTexts.map((source) => ({ title: source.url, url: source.url })),
    };

    return NextResponse.json(result);
  } catch (error) {
    await reportFailure(`${companyName} / ${role}`, error);
    return NextResponse.json({ error: "analyze_failed" }, { status: 500 });
  }
}
