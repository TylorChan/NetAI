import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";

const MetadataSchema = z.object({
  displayTitle: z.string().min(1),
  goalSummary: z.string().min(1)
});

function buildPrompt({ goal, targetProfileContext, customContext }) {
  return [
    "You generate compact UI text for a networking practice session.",
    "Create:",
    "- displayTitle: a short session title for a sidebar list.",
    "- goalSummary: a short goal line shown under stage guidance.",
    "",
    "Rules:",
    "- displayTitle: <= 7 words, no quotes, no trailing period, no emojis.",
    "- goalSummary: <= 14 words, user POV, no fluff, no trailing period.",
    "- Do not invent facts not supported by inputs.",
    "",
    `Goal (raw): ${goal || "(empty)"}`,
    targetProfileContext ? `Target profile context:\n${targetProfileContext}` : "",
    customContext ? `Custom context:\n${customContext}` : "",
    "",
    "Return only JSON: {\"displayTitle\":\"...\",\"goalSummary\":\"...\"}"
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateSessionMetadata({ goal, targetProfileContext, customContext, apiKey }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in worker");
  }

  const model = process.env.SESSION_METADATA_MODEL || "gpt-5-mini";
  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.2
  });

  const structured = llm.withStructuredOutput(MetadataSchema, {
    name: "session_metadata",
    strict: true
  });

  const result = await structured.invoke([
    { role: "system", content: "Return only the requested JSON." },
    {
      role: "user",
      content: buildPrompt({
        goal: String(goal || "").trim(),
        targetProfileContext: String(targetProfileContext || "").trim(),
        customContext: String(customContext || "").trim()
      })
    }
  ]);

  const parsed = MetadataSchema.parse(result);

  const displayTitle = String(parsed.displayTitle || "").trim();
  const goalSummary = String(parsed.goalSummary || "").trim();

  return {
    displayTitle: displayTitle.replace(/\s+/g, " "),
    goalSummary: goalSummary.replace(/\s+/g, " ")
  };
}
