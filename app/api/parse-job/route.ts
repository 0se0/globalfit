import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { canonicalizeStacks, type CanonicalizedStack } from "@/lib/canonicalize-stacks";

export const maxDuration = 30;

const GEMINI_MODEL = "gemini-3.6-flash";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    required_stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
    preferred_stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
    submission_method: {
      type: Type.STRING,
      enum: ["company_site", "job_platform", "email", "unclear"],
    },
    required_documents: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "required_stacks",
    "preferred_stacks",
    "submission_method",
    "required_documents",
  ],
};

const PROMPT = `You are parsing a job posting (JD) into structured JSON. Follow these rules exactly:
- required_stacks / preferred_stacks: list technology/skill names exactly as written in the JD (e.g. "React", not "리액트"). Do not translate or localize stack names. Do not invent stacks not mentioned in the JD.
- submission_method: classify how to apply based on what the JD explicitly states.
  - "company_site" if applying via the company's own site/career page
  - "job_platform" if applying via a third-party job platform (e.g. LinkedIn, Saramin, Wanted)
  - "email" if applying by sending an email
  - "unclear" if the JD does not explicitly state how to apply. Never guess.
- required_documents: list only documents explicitly required by the JD (e.g. "resume", "cover letter", "portfolio"). If none are stated, return an empty array. Never guess.

Job posting:
"""
{{JD_TEXT}}
"""`;

interface GeminiJobOutput {
  required_stacks: string[];
  preferred_stacks: string[];
  submission_method: "company_site" | "job_platform" | "email" | "unclear";
  required_documents: string[];
}

export interface ParsedJob {
  required_stacks: CanonicalizedStack[];
  preferred_stacks: CanonicalizedStack[];
  submission_method: "company_site" | "job_platform" | "email" | "unclear";
  required_documents: string[];
}

export async function POST(request: Request) {
  const { jdText } = (await request.json()) as { jdText?: string };

  if (!jdText || !jdText.trim()) {
    return NextResponse.json({ error: "empty_jd" }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: PROMPT.replace("{{JD_TEXT}}", jdText),
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const parsed: GeminiJobOutput = JSON.parse(response.text ?? "");
    const [required_stacks, preferred_stacks] = await Promise.all([
      canonicalizeStacks(parsed.required_stacks),
      canonicalizeStacks(parsed.preferred_stacks),
    ]);

    const result: ParsedJob = {
      ...parsed,
      required_stacks,
      preferred_stacks,
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "parse_failed" }, { status: 500 });
  }
}
