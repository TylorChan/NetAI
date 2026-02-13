import "dotenv/config";
import cors from "cors";
import express from "express";
import { createYoga, createSchema } from "graphql-yoga";

import { typeDefs } from "./graphql/schema.js";
import { createResolvers } from "./graphql/resolvers.js";
import { createRealtimeSession } from "./services/realtimeSessionService.js";
import { createEvaluationService } from "./services/evaluationService.js";
import { createFollowupEmailService } from "./services/followupEmailService.js";
import { MemoryStore } from "./store/memoryStore.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("api");
const app = express();

const store = new MemoryStore();
const evaluationService = createEvaluationService({
  store,
  workerUrl: process.env.WORKER_URL,
  logger
});
const followupEmailService = createFollowupEmailService({ store });

const schema = createSchema({
  typeDefs,
  resolvers: createResolvers({
    store,
    evaluationService,
    followupEmailService,
    logger
  })
});

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql"
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000"
  })
);
app.use("/v1", express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "netai-api" });
});

app.post("/v1/realtime/sessions", async (req, res) => {
  try {
    const { model, voice } = req.body || {};

    const payload = await createRealtimeSession({
      openAiApiKey: process.env.OPENAI_API_KEY,
      model: model || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
      voice: voice || "alloy"
    });

    res.json(payload);
  } catch (error) {
    logger.error("failed to create realtime session", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.use("/graphql", yoga);

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  logger.info("api started", { port });
});
