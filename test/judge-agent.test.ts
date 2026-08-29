import { describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import type { ParsedJob } from "@/app/api/parse-job/route";

// 실제 Gemini를 부르면 이 하드캡 케이스(모델이 끝없이 도구를 부르려는 상황)를
// 재현할 방법이 없다 — 모델은 결국 스스로 멈추므로 5회+ 시도를 강제로 만들 수
// 없다. 그래서 모델 자체를 "항상 도구를 부르고 싶어하는" 것으로 모킹해
// 하드캡(MAX_ITERATIONS=5)이 실제로 무한 루프를 끊는지 결정적으로 검증한다.
vi.mock("@langchain/google-genai", () => {
  let callCount = 0;
  class ChatGoogleGenerativeAI {
    bindTools() {
      return {
        invoke: vi.fn(async () => {
          callCount += 1;
          return new AIMessage({
            content: "",
            tool_calls: [
              {
                name: "check_ambiguous_requirement",
                args: { original_text: "우대", interpretation: "필수 아님" },
                id: `call_${callCount}`,
              },
            ],
          });
        }),
      };
    }
  }
  return { ChatGoogleGenerativeAI };
});

const { runJudgeAgent } = await import("@/lib/judge-agent");

describe("runJudgeAgent 하드캡", () => {
  it("모델이 매번 도구를 부르려 해도 반복은 5회에서 강제로 끊긴다", async () => {
    const parsedJob: ParsedJob = {
      required_stacks: [{ raw: "React", canonical: "React", registered: true }],
      preferred_stacks: [],
      submission_method: "unclear",
      required_documents: [],
    };

    const result = await runJudgeAgent("dummy jd text", parsedJob);

    // agent 노드는 정확히 MAX_ITERATIONS(5)번만 실행되고, agent 사이사이의
    // tools 노드는 4번만 실행된다 — 5번째 agent 응답 이후엔 도구 호출 의사가
    // 있어도 routeAfterAgent가 강제로 종료시키기 때문
    expect(result.tool_call_count).toBe(4);
    expect(result.skipped).toBe(false);
  });
});
