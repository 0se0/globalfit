import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import {
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  isAIMessage,
} from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { canonicalizeStacks } from "./canonicalize-stacks";
import type { ParsedJob } from "@/app/api/parse-job/route";

const GEMINI_MODEL = "gemini-3.6-flash";
// 하드 룰: 판단 지점 반복은 최대 5회로 캡 (무한 루프 방지)
const MAX_ITERATIONS = 5;

export interface AmbiguousRequirement {
  original_text: string;
  interpretation: string;
}

export interface LowConfidenceField {
  field: string;
  reason: string;
}

export interface KeywordLookup {
  stack_name: string;
  canonical: string | null;
  registered: boolean;
}

export interface JudgeResult {
  ambiguous_requirements: AmbiguousRequirement[];
  low_confidence_fields: LowConfidenceField[];
  keyword_lookups: KeywordLookup[];
  tool_call_count: number;
  skipped: boolean;
}

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  iterations: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
});

function buildTools(collectors: {
  ambiguousRequirements: AmbiguousRequirement[];
  lowConfidenceFields: LowConfidenceField[];
  keywordLookups: KeywordLookup[];
  incrementToolCallCount: () => void;
}) {
  const lookupKeyword = tool(
    async ({ stack_name }: { stack_name: string }) => {
      collectors.incrementToolCallCount();
      const [result] = await canonicalizeStacks([stack_name]);
      collectors.keywordLookups.push({
        stack_name,
        canonical: result.canonical,
        registered: result.registered,
      });
      return JSON.stringify(result);
    },
    {
      name: "lookup_keyword",
      description:
        "Look up a stack/technology name in the vector-store-backed keyword dictionary to find its canonical form and known synonyms.",
      schema: z.object({ stack_name: z.string() }),
    }
  );

  const checkAmbiguousRequirement = tool(
    async ({
      original_text,
      interpretation,
    }: {
      original_text: string;
      interpretation: string;
    }) => {
      collectors.incrementToolCallCount();
      collectors.ambiguousRequirements.push({ original_text, interpretation });
      return "recorded";
    },
    {
      name: "check_ambiguous_requirement",
      description:
        "Record your reinterpretation of an ambiguous JD requirement phrase (e.g. '경험 우대', 'nice to have'). You must supply the interpretation yourself — this tool only records it.",
      schema: z.object({
        original_text: z.string(),
        interpretation: z.string(),
      }),
    }
  );

  const flagLowConfidence = tool(
    async ({ field, reason }: { field: string; reason: string }) => {
      collectors.incrementToolCallCount();
      collectors.lowConfidenceFields.push({ field, reason });
      return "recorded";
    },
    {
      name: "flag_low_confidence",
      description:
        "Flag a specific field from the parsed job posting as low-confidence, with a reason.",
      schema: z.object({ field: z.string(), reason: z.string() }),
    }
  );

  return [lookupKeyword, checkAmbiguousRequirement, flagLowConfidence];
}

function buildSystemPrompt(): string {
  return `You are a judgment-point agent reviewing an already-parsed job posting. You have three tools available:
- lookup_keyword: verify/resolve a stack name against the keyword dictionary
- check_ambiguous_requirement: record your own reinterpretation of an ambiguous requirement phrase in the JD
- flag_low_confidence: flag a specific parsed field you are not confident about, with a reason

Use only the tools that are actually needed. If the parsed job posting is already clear and unambiguous, call no tools and just reply with a short confirmation. Do not compute or mention any match score or percentage — that is never your job.`;
}

function buildHumanPrompt(jdText: string, parsedJob: ParsedJob): string {
  return `Original job posting text:
"""
${jdText}
"""

Already-parsed structured output:
${JSON.stringify(parsedJob, null, 2)}

Review the JD text against the parsed output. Use your tools as needed to resolve ambiguity or flag low-confidence fields.`;
}

export async function runJudgeAgent(
  jdText: string,
  parsedJob: ParsedJob
): Promise<JudgeResult> {
  const collectors = {
    ambiguousRequirements: [] as AmbiguousRequirement[],
    lowConfidenceFields: [] as LowConfidenceField[],
    keywordLookups: [] as KeywordLookup[],
    toolCallCount: 0,
    incrementToolCallCount() {
      this.toolCallCount++;
    },
  };

  const tools = buildTools(collectors);
  const model = new ChatGoogleGenerativeAI({
    model: GEMINI_MODEL,
    apiKey: process.env.GEMINI_API_KEY,
  });
  const modelWithTools = model.bindTools(tools);

  async function agentNode(state: typeof AgentState.State) {
    const response = await modelWithTools.invoke(state.messages);
    return {
      messages: [response],
      iterations: state.iterations + 1,
    };
  }

  function routeAfterAgent(state: typeof AgentState.State): "tools" | "end" {
    const lastMessage = state.messages[state.messages.length - 1];
    const hasToolCalls =
      isAIMessage(lastMessage) && (lastMessage.tool_calls?.length ?? 0) > 0;
    if (hasToolCalls && state.iterations < MAX_ITERATIONS) return "tools";
    return "end";
  }

  const graph = new StateGraph(AgentState)
    .addNode("agent", agentNode)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, { tools: "tools", end: END })
    .addEdge("tools", "agent")
    .compile();

  await graph.invoke({
    messages: [
      new SystemMessage(buildSystemPrompt()),
      new HumanMessage(buildHumanPrompt(jdText, parsedJob)),
    ],
    iterations: 0,
  });

  return {
    ambiguous_requirements: collectors.ambiguousRequirements,
    low_confidence_fields: collectors.lowConfidenceFields,
    keyword_lookups: collectors.keywordLookups,
    tool_call_count: collectors.toolCallCount,
    skipped: false,
  };
}
