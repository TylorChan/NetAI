import "dotenv/config";
import express from "express";
import { evaluateConversation } from "./evaluate.js";
import { summarizeConversation } from "./summarize.js";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required for worker startup");
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "netai-worker" });
});

app.post("/tasks/evaluate", async (req, res) => {
  try {
    const { session, turns } = req.body || {};

    if (!session || !Array.isArray(turns)) {
      return res.status(400).json({ error: "session and turns are required" });
    }

    const evaluation = await evaluateConversation({
      session,
      turns,
      apiKey: process.env.OPENAI_API_KEY
    });

    res.json(evaluation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/tasks/summarize", async (req, res) => {
  try {
    const { session, priorSummary, newTurns } = req.body || {};

    if (!session || !Array.isArray(newTurns)) {
      return res.status(400).json({ error: "session and newTurns are required" });
    }

    const payload = await summarizeConversation({
      session,
      priorSummary: String(priorSummary || ""),
      newTurns,
      apiKey: process.env.OPENAI_API_KEY
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = Number(process.env.PORT || 4100);
app.listen(port, () => {
  console.log(`netai-worker started on :${port}`);
});
