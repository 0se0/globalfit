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
    confirmed_gap_stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["resume_suggestion", "confirmed_gap_stacks"],
};

const RULES = `Follow these rules exactly:
- resume_suggestion: rewrite the resume text with ONLY reordering of sentences/paragraphs, rewording with synonyms, shifting emphasis, or rephrasing existing facts/numbers (e.g. "팀 프로젝트 참여" -> "5인 팀에서 백엔드 담당"). NEVER add a new fact, number, experience, project name, or technology/stack name that is not already present in the original document. Output in the same language as the original document.
- confirmed_gap_stacks: you are given a list of "candidate stacks" the job posting needs. For each candidate, include it in this array ONLY IF that exact stack is already literally mentioned somewhere in the original document (even briefly, e.g. in a project description). If a candidate is not mentioned anywhere in the original document, do NOT include it. Never guess or assume presence. If none are confirmed, return an empty array.`;

const TEXT_PROMPT = `You are helping rewrite a resume/application document and checking which candidate stacks it already mentions. ${RULES}

Candidate stacks to check:
{{CANDIDATE_STACKS}}

Document:
"""
{{RESUME_TEXT}}
"""`;

const FILE_PROMPT = `You are helping rewrite a resume/application document (attached as a file) and checking which candidate stacks it already mentions. ${RULES}

Candidate stacks to check:
{{CANDIDATE_STACKS}}`;

interface GeminiSuggestionOutput {
  resume_suggestion: string;
  confirmed_gap_stacks: string[];
}

export async function POST(request: Request) {
  const { resumeText, resumeFile, gapStacks } = (await request.json()) as {
    resumeText?: string;
    resumeFile?: { dataBase64: string; mimeType: string };
    gapStacks?: string[];
  };

  if (resumeFile && resumeFile.dataBase64.length > (MAX_FILE_SIZE * 4) / 3) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }
  if (!resumeFile && (!resumeText || !resumeText.trim())) {
    return NextResponse.json({ error: "empty_resume" }, { status: 400 });
  }

  const candidateStacksText = (gapStacks ?? []).join(", ") || "(none)";

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents = resumeFile
      ? [
          {
            role: "user",
            parts: [
              {
                text: FILE_PROMPT.replace("{{CANDIDATE_STACKS}}", candidateStacksText),
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
      : TEXT_PROMPT.replace("{{CANDIDATE_STACKS}}", candidateStacksText).replace(
          "{{RESUME_TEXT}}",
          resumeText as string
        );

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
