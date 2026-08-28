import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { retryOnce } from "@/lib/retry-once";
import { reportFailure } from "@/lib/report-failure";

export const maxDuration = 30;

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_FILE_SIZE = 3 * 1024 * 1024;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    resume_suggestion: { type: Type.STRING },
    cover_letter_suggestion: { type: Type.STRING },
    portfolio_suggestion: { type: Type.STRING },
    confirmed_gap_stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
    interview_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "resume_suggestion",
    "cover_letter_suggestion",
    "portfolio_suggestion",
    "confirmed_gap_stacks",
    "interview_questions",
  ],
};

const RULES = `Follow these rules exactly:
- resume_suggestion: rewrite the resume text with ONLY reordering of sentences/paragraphs, rewording with synonyms, shifting emphasis, or rephrasing existing facts/numbers (e.g. "팀 프로젝트 참여" -> "5인 팀에서 백엔드 담당"). NEVER add a new fact, number, experience, project name, or technology/stack name that is not already present in the original document. Output in the same language as the original document.
- cover_letter_suggestion: if a cover letter document is provided below, rewrite it with the SAME restrictions as resume_suggestion (only reordering paragraphs, rewording, shifting emphasis — never adding new facts). If NO cover letter document is provided, return an empty string "" for this field.
- portfolio_suggestion: if a portfolio document is provided below, rewrite it with the SAME restrictions as resume_suggestion, focused on reordering/prioritizing existing projects to best match the job posting's stacks (never inventing a new project or stack). If NO portfolio document is provided, return an empty string "" for this field.
- confirmed_gap_stacks: you are given a list of "candidate stacks" the job posting needs. For each candidate, include it in this array ONLY IF that exact stack is already literally mentioned somewhere in the original resume document (even briefly, e.g. in a project description). If a candidate is not mentioned anywhere in the original resume document, do NOT include it. Never guess or assume presence. If none are confirmed, return an empty array.
- interview_questions: generate EXACTLY 2 realistic technical interview follow-up questions, as an interviewer would ask after reading this resume alongside the job posting's required/preferred stacks. Each question MUST reference a specific project, experience, or technology that is literally mentioned in the original resume document — do not invent scenarios or reference anything not in the document. Output in the same language as the original document.`;

const TEXT_PROMPT = `You are helping rewrite a resume/application document, checking which candidate stacks it already mentions, and drafting interview follow-up questions. ${RULES}

Job posting's required/preferred stacks (for interview question relevance):
{{JOB_STACKS}}

Candidate stacks to check:
{{CANDIDATE_STACKS}}

Resume document:
"""
{{RESUME_TEXT}}
"""

Cover letter document (optional, may be empty):
"""
{{COVER_LETTER_TEXT}}
"""

Portfolio document (optional, may be empty):
"""
{{PORTFOLIO_TEXT}}
"""`;

const FILE_PROMPT = `You are helping rewrite a resume/application document (attached as a file), checking which candidate stacks it already mentions, and drafting interview follow-up questions. ${RULES}

Job posting's required/preferred stacks (for interview question relevance):
{{JOB_STACKS}}

Candidate stacks to check:
{{CANDIDATE_STACKS}}

Cover letter document (optional, may be empty):
"""
{{COVER_LETTER_TEXT}}
"""

Portfolio document (optional, may be empty):
"""
{{PORTFOLIO_TEXT}}
"""`;

interface GeminiSuggestionOutput {
  resume_suggestion: string;
  cover_letter_suggestion: string;
  portfolio_suggestion: string;
  confirmed_gap_stacks: string[];
  interview_questions: string[];
}

export async function POST(request: Request) {
  const { resumeText, resumeFile, coverLetterText, portfolioText, gapStacks, jobStacks } =
    (await request.json()) as {
      resumeText?: string;
      resumeFile?: { dataBase64: string; mimeType: string };
      coverLetterText?: string;
      portfolioText?: string;
      gapStacks?: string[];
      jobStacks?: string[];
    };

  if (resumeFile && resumeFile.dataBase64.length > (MAX_FILE_SIZE * 4) / 3) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }
  if (!resumeFile && (!resumeText || !resumeText.trim())) {
    return NextResponse.json({ error: "empty_resume" }, { status: 400 });
  }

  const candidateStacksText = (gapStacks ?? []).join(", ") || "(none)";
  const jobStacksText = (jobStacks ?? []).join(", ") || "(none)";
  const coverLetterTextValue = coverLetterText?.trim() || "(none provided)";
  const portfolioTextValue = portfolioText?.trim() || "(none provided)";

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents = resumeFile
      ? [
          {
            role: "user",
            parts: [
              {
                text: FILE_PROMPT.replace("{{CANDIDATE_STACKS}}", candidateStacksText)
                  .replace("{{JOB_STACKS}}", jobStacksText)
                  .replace("{{COVER_LETTER_TEXT}}", coverLetterTextValue)
                  .replace("{{PORTFOLIO_TEXT}}", portfolioTextValue),
              },
              {
                inlineData: {
                  data: resumeFile.dataBase64,
                  mimeType: resumeFile.mimeType,
                },
              },
            ],
          },
        ]
      : TEXT_PROMPT.replace("{{CANDIDATE_STACKS}}", candidateStacksText)
          .replace("{{JOB_STACKS}}", jobStacksText)
          .replace("{{RESUME_TEXT}}", resumeText as string)
          .replace("{{COVER_LETTER_TEXT}}", coverLetterTextValue)
          .replace("{{PORTFOLIO_TEXT}}", portfolioTextValue);

    const result = await retryOnce(async () => {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      return JSON.parse(response.text ?? "") as GeminiSuggestionOutput;
    });

    return NextResponse.json(result);
  } catch (error) {
    await reportFailure(resumeText ?? `[file] ${resumeFile?.mimeType ?? ""}`, error);
    return NextResponse.json({ error: "suggest_failed" }, { status: 500 });
  }
}
