import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const EvaluationSchema = z.object({
  score: z.number().int().min(1).max(10),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
  followUpEmail: z.string().default("")
});

const EvalState = Annotation.Root({
  session: Annotation(),
  turns: Annotation(),
  transcript: Annotation(),
  evaluation: Annotation()
});

function formatTurnsForPrompt(turns) {
  return turns
    .map((turn, index) => {
      const role = (turn.role || "user").toUpperCase();
      const content = String(turn.content || "").trim();
      return `${index + 1}. [${role}] ${content}`;
    })
    .join("\n");
}

function buildPrompt({ session, transcript }) {
  const goal = session?.goal || "Networking conversation practice";
  const context = session?.customContext || session?.targetProfileContext || "General networking";
  const stage = session?.stageState || "UNKNOWN";

  return [
    "You are a strict networking conversation evaluator.",
    "Score the user from 1 to 10 using practical networking quality.",
    "Feedback must be sharp, specific, and evidence-based.",
    "Do not be polite or vague. Be direct and diagnostic.",
    "Each bullet must be one sentence and under 22 words.",
    "Reference concrete moments from transcript when possible.",
    "",
    `Goal: ${goal}`,
    `Context: ${context}`,
    `Final stage: ${stage}`,
    "",
    "Transcript:",
    transcript
  ].join("\n");
}

function clampBullets(items, fallback, maxItems = 4) {
  const normalized = (items || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems);

  if (normalized.length) {
    return normalized;
  }

  return [fallback];
}

function normalizeEvaluation(raw) {
  const parsed = EvaluationSchema.parse(raw);
  return {
    ...parsed,
    strengths: clampBullets(
      parsed.strengths,
      "You kept conversational momentum instead of answering in isolated one-liners."
    ),
    improvements: clampBullets(
      parsed.improvements,
      "Your questions lacked specificity, so responses stayed generic and low-signal."
    ),
    nextActions: clampBullets(
      parsed.nextActions,
      "Prepare two role-specific questions and one follow-up probe before starting."
    ).slice(0, 3),
    followUpEmail: String(parsed.followUpEmail || "").trim()
  };
}

function createGraph({ apiKey, model }) {
  const llm = new ChatOpenAI({
    apiKey,
    model
  });

  const structuredLlm = llm.withStructuredOutput(EvaluationSchema, {
    name: "networking_session_evaluation",
    strict: true
  });

  return new StateGraph(EvalState)
    .addNode("prepareTranscript", async (state) => ({
      transcript: formatTurnsForPrompt(state.turns || [])
    }))
    .addNode("evaluateSession", async (state) => {
      const result = await structuredLlm.invoke([
        {
          role: "system",
          content:
            [
              "Return only the requested structured fields.",
              "For strengths: provide up to 4 bullets, each one sentence.",
              "For improvements: provide up to 4 critical bullets that pinpoint mistakes.",
              "For nextActions: provide exactly 3 high-impact actions for the next practice.",
              "Focus on stage transitions, question quality, listening depth, and close quality."
            ].join(" ")
        },
        {
          role: "user",
          content: buildPrompt({
            session: state.session,
            transcript: state.transcript
          })
        }
      ]);

      return {
        evaluation: normalizeEvaluation(result)
      };
    })
    .addEdge(START, "prepareTranscript")
    .addEdge("prepareTranscript", "evaluateSession")
    .addEdge("evaluateSession", END)
    .compile();
}

export async function evaluateConversation({ session, turns, apiKey }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in worker");
  }

  const model = process.env.EVALUATION_MODEL || "gpt-5.2";
  const graph = createGraph({ apiKey, model });
  const result = await graph.invoke({
    session,
    turns
  });

  return normalizeEvaluation(result.evaluation);
}
