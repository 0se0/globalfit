import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { embedTexts } from "@/lib/canonicalize-stacks";
import {
  distillProfile,
  type DeclaredProfile,
  type RawSignal,
  type SignalWithVector,
} from "@/lib/distill-profile";

// LLM 판단(generateContent)이 아니라 임베딩 유사도 조회만 쓴다 — 판단
// 지점(judge-job)의 도구 3개·5회 캡과 무관한, 완전히 별도의 순수 계산 경로
export async function POST(request: Request) {
  const { declared, signals } = (await request.json()) as {
    declared?: DeclaredProfile;
    signals?: RawSignal[];
  };

  if (!declared || declared.roles.length === 0) {
    return NextResponse.json({ error: "empty_declared_profile" }, { status: 400 });
  }

  const signalList = signals ?? [];
  const declaredText = [
    declared.roles.join(", "),
    declared.yearsOfExperience,
    declared.workStyle,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const vectors = await embedTexts(ai, [
      declaredText,
      ...signalList.map((s) => s.value),
    ]);
    const [declaredVector, ...signalVectors] = vectors;

    const signalsWithVectors: SignalWithVector[] = signalList.map((signal, i) => ({
      ...signal,
      vector: signalVectors[i],
    }));

    const result = distillProfile(declared, declaredVector, signalsWithVectors);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "distill_failed" }, { status: 500 });
  }
}
