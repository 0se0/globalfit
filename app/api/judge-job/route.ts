import { NextResponse } from "next/server";
import { runJudgeAgent, type JudgeResult } from "@/lib/judge-agent";
import { shouldRunJudgeAgent } from "@/lib/should-run-judge-agent";
import type { ParsedJob } from "@/app/api/parse-job/route";
import { retryOnce } from "@/lib/retry-once";
import { reportFailure } from "@/lib/report-failure";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { jdText, parsedJob } = (await request.json()) as {
    jdText?: string;
    parsedJob?: ParsedJob;
  };

  if (!jdText || !jdText.trim() || !parsedJob) {
    return NextResponse.json({ error: "missing_input" }, { status: 400 });
  }

  // 무료 티어 일일 호출 한도를 아끼기 위해, 미등록 스택도 없고 JD에 애매함
  // 신호도 없으면 에이전트(최소 1회의 generateContent 호출)를 아예 안 부른다
  if (!shouldRunJudgeAgent(jdText, parsedJob)) {
    const result: JudgeResult = {
      ambiguous_requirements: [],
      low_confidence_fields: [],
      keyword_lookups: [],
      tool_call_count: 0,
      skipped: true,
    };
    return NextResponse.json(result);
  }

  try {
    const result = await retryOnce(() => runJudgeAgent(jdText, parsedJob));
    return NextResponse.json(result);
  } catch (error) {
    await reportFailure(jdText, error);
    return NextResponse.json({ error: "judge_failed" }, { status: 500 });
  }
}
