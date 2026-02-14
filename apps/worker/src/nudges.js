import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";

const NudgesSchema = z.object({
  nudges: z.array(z.string()).min(1).max(3)
});

function formatTurns(turns) {
  return (turns || [])
    .slice(-10)
    .map((turn, index) => {
      const role = (turn.role || "user").toUpperCase();
      const content = String(turn.content || "").trim().replaceAll("\n", " ");
      return `${index + 1}. [${role}] ${content}`;
    })
    .join("\n");
}

function buildPrompt({ session, conversationSummary, recentTurns }) {
  const goal = session?.goal || "";
  const persona = session?.targetProfileContext || "";
  const custom = session?.customContext || "";
  const stage = session?.stageState || "SMALL_TALK";
  const transcript = formatTurns(recentTurns || []);

  return [
    "You write ultra-short 'what to say next' nudges for a live networking conversation.",
    "The user is speaking to a real person (you) in a realistic networking chat.",
    "Generate 1-3 options the user can say next.",
    "",
    "Hard rules:",
    "- Each nudge must be 5-12 words.",
    "- Write in the user's voice (first-person).",
    "- At least 1 nudge must be a question.",
    "- Must be directly grounded in provided context; do not invent facts.",
    "- Do not mention AI, practice, scoring, stages, or 'transcript'.",
    "",
    `Stage (internal): ${stage}`,
    goal ? `User goal: ${goal}` : "User goal: (not provided)",
    persona ? `Your persona/background:\n${persona}` : "Your persona/background: (not provided)",
    custom ? `Additional context:\n${custom}` : "",
    conversationSummary ? `Rolling summary:\n${conversationSummary}` : "",
    transcript ? `Recent turns:\n${transcript}` : "Recent turns: (none)",
    "",
    "Return only JSON: {\"nudges\": [\"...\", \"...\", \"...\"]}"
  ].join("\n");
}

export async function generateNudges({ session, conversationSummary, recentTurns, apiKey }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in worker");
  }

  const model = process.env.NUDGE_MODEL || "gpt-5-mini";
  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.3
  });

  const structured = llm.withStructuredOutput(NudgesSchema, {
    name: "talk_nudges",
    strict: true
  });

  const result = await structured.invoke([
    { role: "system", content: "Return only the requested JSON." },
    {
      role: "user",
      content: buildPrompt({
        session,
        conversationSummary: String(conversationSummary || "").trim(),
        recentTurns: Array.isArray(recentTurns) ? recentTurns : []
      })
    }
  ]);

  const parsed = NudgesSchema.parse(result);
  return {
    nudges: parsed.nudges.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
  };
}
