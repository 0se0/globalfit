import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { retryOnce } from "@/lib/retry-once";
import { reportFailure } from "@/lib/report-failure";
import { canonicalizeStacks, type CanonicalizedStack } from "@/lib/canonicalize-stacks";

export const maxDuration = 60;

const GEMINI_MODEL = "gemini-3.6-flash";

// roadmap과 SWOT 전략(SO/WO/ST/WT) 항목이 전부 "키워드 한 줄 + 설명 한 줄" 형태를
// 공유해서 스키마를 재사용 — 화면에서도 같은 불릿 컴포넌트로 렌더링됨
const STRATEGY_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    keyword: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ["keyword", "description"],
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    company_info: {
      type: Type.OBJECT,
      properties: {
        general: { type: Type.STRING },
        mission_vision: { type: Type.STRING },
        tech_capability: { type: Type.STRING },
        talent_profile: { type: Type.STRING },
      },
      required: ["general", "mission_vision", "tech_capability", "talent_profile"],
    },
    business_analysis: {
      type: Type.OBJECT,
      properties: {
        business_areas: { type: Type.STRING },
        current_focus: { type: Type.STRING },
        future_direction: { type: Type.STRING },
        recent_news: { type: Type.STRING },
        financials: { type: Type.STRING },
        org_roles: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        "business_areas",
        "current_focus",
        "future_direction",
        "recent_news",
        "financials",
        "org_roles",
      ],
    },
    role_understanding: {
      type: Type.OBJECT,
      properties: {
        core_work_type: { type: Type.STRING },
        differs_from_peers: { type: Type.STRING },
        required_capabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
        business_fit_points: { type: Type.ARRAY, items: { type: Type.STRING } },
        daily_work: { type: Type.STRING },
        growth_path: { type: Type.STRING },
        irregular_issues: { type: Type.STRING },
      },
      required: [
        "core_work_type",
        "differs_from_peers",
        "required_capabilities",
        "business_fit_points",
        "daily_work",
        "growth_path",
        "irregular_issues",
      ],
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
        pest: {
          type: Type.OBJECT,
          properties: {
            political: { type: Type.STRING },
            economic: { type: Type.STRING },
            social: { type: Type.STRING },
            technological: { type: Type.STRING },
          },
          required: ["political", "economic", "social", "technological"],
        },
        swot_strategies: {
          type: Type.OBJECT,
          properties: {
            so: { type: Type.ARRAY, items: STRATEGY_ITEM_SCHEMA },
            wo: { type: Type.ARRAY, items: STRATEGY_ITEM_SCHEMA },
            st: { type: Type.ARRAY, items: STRATEGY_ITEM_SCHEMA },
            wt: { type: Type.ARRAY, items: STRATEGY_ITEM_SCHEMA },
          },
          required: ["so", "wo", "st", "wt"],
        },
      },
      required: ["industry_trends", "competitors", "swot", "pest", "swot_strategies"],
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
        roadmap: { type: Type.ARRAY, items: STRATEGY_ITEM_SCHEMA },
        self_research_guide: { type: Type.ARRAY, items: STRATEGY_ITEM_SCHEMA },
      },
      required: ["recent_postings", "roadmap", "self_research_guide"],
    },
  },
  required: [
    "company_info",
    "business_analysis",
    "role_understanding",
    "environment_analysis",
    "job_strategy",
  ],
};

const RULES = `Follow these rules exactly:
- Base every fact ONLY on the source materials given below. Never invent or guess a fact, number, article, posting, or competitor name that isn't actually present in the source materials.
- If a field isn't covered by the source materials, return an empty string "" (or empty array [] for array fields) for that field instead of guessing. Do not pad with generic filler text.
- financials: summarize only what the source materials actually state about revenue/profit/loss. If nothing is mentioned, return "".
- talent_profile: the kind of person, competencies, or values this company explicitly says it looks for (인재상). Only from the source materials. If none, "".
- current_focus: the concrete projects, products, or initiatives this company is putting its effort into RIGHT NOW, per the source materials (e.g. a named platform rebuild, a specific market expansion, a product launch). Name the thing — do not be vague. If the source materials don't say, "".
- future_direction: where the company states it is headed — growth plans, strategic direction, stated goals. Only from the source materials. If none, "".
- recent_postings: list job postings mentioned in the source materials, with the title and the technology/skill stack names literally mentioned in that posting. If none are found, return an empty array.
- org_roles: at least 3 real job functions/departments mentioned in the source materials, if present.
- role_understanding: an analysis of what working as {{ROLE}} at THIS specific company actually means — the point is to show the applicant that the same job title is not the same job everywhere. Ground every field in the source materials only:
  - core_work_type: the nature of the work this company's {{ROLE}} actually does (e.g. "SI(시스템 통합) — 고객사 요구사항을 받아 시스템을 구축·납품", "자체 서비스 운영·개선", "컨설팅"). Derive it from what the source materials reveal about the company's business model and this role. If the materials don't make it clear, "".
  - differs_from_peers: how this role here differs from the same title at other kinds of companies, based on this company's specific business. Only if the source materials support the distinction; otherwise "".
  - required_capabilities: 3-6 concrete capabilities this role needs, drawn from the source materials (job postings, role descriptions). Keep stack names in their original form.
  - business_fit_points: 2-4 factual points ABOUT THE COMPANY (what it does, where it is heading, what it values) that an applicant could cite when arguing "I can adapt well to this business" in a cover letter. Company-side facts only — never invent the applicant's experience or state that the applicant has anything.
  - daily_work: what a day in this role looks like — ONLY if the source materials actually describe it (e.g. a 현직자 인터뷰, a team blog). If not described, "".
  - growth_path: how the scope of this role changes over roughly 3 / 5 / 7 years — ONLY if the source materials describe it. If not, "".
  - irregular_issues: how practitioners in this role handle non-routine issues (incidents, peak-load periods, etc.) and improve afterward — ONLY if the source materials describe it. If not, "".
- self_research_guide: for EACH of role_understanding's daily_work, growth_path, irregular_issues that you returned as "" (empty), add exactly one item here telling the applicant how to find that out for themselves. keyword = what to research (e.g. "하루 일과", "3·5·7년 뒤 업무 범위 변화", "비정기 이슈 실무 대응"). description = a concrete way to find it — a specific question to ask a current employee, or where to look (팀 기술 블로그, 컨퍼런스 발표, 잡플래닛·블라인드 리뷰, 직무 오픈채팅). Do NOT add an item for a field you already filled above. If all three are filled, return an empty array.
- pest: a PEST analysis (Political, Economic, Social, Technological) of the macro-environment this company operates in, grounded only in what the source materials state or directly imply. If a dimension isn't covered by the source materials, return "" for it — do not invent generic industry commentary.
- roadmap: a concrete job-prep roadmap for someone targeting {{ROLE}} at this company, grounded in what the source materials reveal about the company's needs. Return it as a list of 4-7 items, each a short actionable keyword/phrase (e.g. "React 실무 경험 쌓기") plus a 1-2 sentence description of why it matters and how (grounded in the source materials — do not pad with generic career advice unconnected to this company).
- swot_strategies: a TOWS matrix — 1-3 items per bucket, each a short keyword/phrase plus a 1-2 sentence description, all specific to someone targeting {{ROLE}} at this company. Derive every item strictly by combining two fields of the swot object above (never invent new facts not already stated there):
  - so: how the applicant can leverage the company's Strengths to seize its Opportunities.
  - wo: what the applicant should build or highlight to help the company turn its Weaknesses into a path toward its Opportunities.
  - st: how the applicant's preparation can help the company defend its Strengths against its Threats.
  - wt: what the applicant should prepare to minimize risk where the company's Weaknesses and Threats overlap.
  If a swot field used for a given bucket is empty (""), return an empty array for that bucket instead of inventing content. Do not repeat roadmap items here — swot_strategies is specifically about how the applicant's preparation responds to the company's SWOT combinations, not general skill-building.
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
    talent_profile: string;
  };
  business_analysis: {
    business_areas: string;
    current_focus: string;
    future_direction: string;
    recent_news: string;
    financials: string;
    org_roles: string[];
  };
  role_understanding: {
    core_work_type: string;
    differs_from_peers: string;
    required_capabilities: string[];
    business_fit_points: string[];
    daily_work: string;
    growth_path: string;
    irregular_issues: string;
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
    pest: {
      political: string;
      economic: string;
      social: string;
      technological: string;
    };
    swot_strategies: {
      so: { keyword: string; description: string }[];
      wo: { keyword: string; description: string }[];
      st: { keyword: string; description: string }[];
      wt: { keyword: string; description: string }[];
    };
  };
  job_strategy: {
    recent_postings: { title: string; stacks: string[] }[];
    roadmap: { keyword: string; description: string }[];
    self_research_guide: { keyword: string; description: string }[];
  };
}

export interface CompanyReport {
  company_info: GeminiCompanyOutput["company_info"];
  business_analysis: GeminiCompanyOutput["business_analysis"];
  role_understanding: GeminiCompanyOutput["role_understanding"];
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
      role_understanding: parsed.role_understanding,
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
