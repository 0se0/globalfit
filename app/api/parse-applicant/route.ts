import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { canonicalizeStacks, type CanonicalizedStack } from "@/lib/canonicalize-stacks";
import { retryOnce } from "@/lib/retry-once";
import { reportFailure } from "@/lib/report-failure";

export const maxDuration = 30;

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_FILE_SIZE = 3 * 1024 * 1024;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    stacks: { type: Type.ARRAY, items: { type: Type.STRING } },
    projects: { type: Type.ARRAY, items: { type: Type.STRING } },
    years_of_experience: { type: Type.STRING },
    experience: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["stacks", "projects", "years_of_experience", "experience"],
};

const RULES = `Follow these rules exactly:
- stacks: list technology/skill names exactly as written in the document (e.g. "React", not "리액트"). Do not translate or localize stack names. Do not invent stacks not mentioned in the document.
- projects: short summaries of projects/experience items mentioned, one string per project. Do not invent projects not mentioned.
- years_of_experience: the applicant's years of professional experience, as stated or clearly inferable from the document (e.g. "3년", "2 years"). If it cannot be determined, return exactly "unclear". Never guess.
- experience: notable experience/activity items (work history, education, activities) as short strings, one per item.`;

const TEXT_PROMPT = `You are parsing a resume/application document into structured JSON. ${RULES}

Document:
"""
{{RESUME_TEXT}}
"""`;

// PDF는 별도 텍스트 추출 없이 파일을 직접 읽어 구조화까지 한 번에 처리한다
// (무료 티어 일일 호출 횟수를 아끼기 위해 추출+구조화 2회 호출을 1회로 통합 —
// 자세한 배경은 docs/slices/07-판단지점-에이전트.md의 "발견한 중요 이슈" 참고)
const FILE_PROMPT = `You are parsing a resume/application document (attached as a file) into structured JSON. ${RULES}`;

interface GeminiApplicantOutput {
  stacks: string[];
  projects: string[];
  years_of_experience: string;
  experience: string[];
}

export interface ParsedApplicant {
  stacks: CanonicalizedStack[];
  projects: string[];
  years_of_experience: string;
  experience: string[];
}

export async function POST(request: Request) {
  const { resumeText, resumeFile } = (await request.json()) as {
    resumeText?: string;
    resumeFile?: { dataBase64: string; mimeType: string };
  };

  if (resumeFile && resumeFile.dataBase64.length > (MAX_FILE_SIZE * 4) / 3) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }
  if (!resumeFile && (!resumeText || !resumeText.trim())) {
    return NextResponse.json({ error: "empty_resume" }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents = resumeFile
      ? [
          {
            role: "user",
            parts: [
              { text: FILE_PROMPT },
              {
                inlineData: {
                  data: resumeFile.dataBase64,
                  mimeType: resumeFile.mimeType,
                },
              },
            ],
          },
        ]
      : TEXT_PROMPT.replace("{{RESUME_TEXT}}", resumeText as string);

    const parsed = await retryOnce(async () => {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      return JSON.parse(response.text ?? "") as GeminiApplicantOutput;
    });

    const stacks = await canonicalizeStacks(parsed.stacks);

    const result: ParsedApplicant = { ...parsed, stacks };
    return NextResponse.json(result);
  } catch (error) {
    await reportFailure(resumeText ?? `[file] ${resumeFile?.mimeType ?? ""}`, error);
    return NextResponse.json({ error: "parse_failed" }, { status: 500 });
  }
}
