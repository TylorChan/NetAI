import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";

const SummarySchema = z.object({
  summary: z.string().min(1)
});

function formatTurnsForPrompt(turns) {
  return (turns || [])
    .map((turn, index) => {
      const role = (turn.role || "user").toUpperCase();
      const content = String(turn.content || "").trim();
      return `${index + 1}. [${role}] ${content}`;
    })
    .join("\n");
}

function buildPrompt({ session, priorSummary, transcriptDelta }) {
  const goal = session?.goal || "Networking conversation practice";
  const context = session?.customContext || session?.targetProfileContext || "General networking";
  const stage = session?.stageState || "UNKNOWN";

  return [
    "You maintain a rolling conversation summary for a networking practice app.",
    "Update the rolling summary using ONLY the new transcript lines (delta) and the prior summary.",
    "The summary is used to continue the conversation later, so preserve durable facts, names, and open threads.",
    "Write as compact bullet points. No more than 10 bullets total.",
    "Each bullet must be <= 18 words.",
    "Do not invent facts not present in prior summary or delta transcript.",
    "",
    `Goal: ${goal}`,
    `Context: ${context}`,
    `Current stage: ${stage}`,
    "",
    "Prior rolling summary (may be empty):",
    priorSummary || "(empty)",
    "",
    "New transcript lines to incorporate:",
    transcriptDelta || "(none)",
    "",
    "Return only JSON with key summary."
  ].join("\n");
}

export async function summarizeConversation({ session, priorSummary, newTurns, apiKey }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in worker");
  }

  const model = process.env.SUMMARY_MODEL || "gpt-5-mini";
  const llm = new ChatOpenAI({
    apiKey,
    model
  });

  const structuredLlm = llm.withStructuredOutput(SummarySchema, {
    name: "conversation_rolling_summary",
    strict: true
  });

  const transcriptDelta = formatTurnsForPrompt(newTurns || []);
  const result = await structuredLlm.invoke([
    {
      role: "system",
      content: "Return only the requested JSON."
    },
    {
      role: "user",
      content: buildPrompt({ session, priorSummary, transcriptDelta })
    }
  ]);

  const parsed = SummarySchema.parse(result);
  return {
    summary: String(parsed.summary || "").trim()
  };
}

