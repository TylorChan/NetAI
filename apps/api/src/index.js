import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import Redis from "ioredis";
import { createYoga, createSchema } from "graphql-yoga";
import depthLimit from "graphql-depth-limit";

import { typeDefs } from "./graphql/schema.js";
import { createResolvers } from "./graphql/resolvers.js";
import { createLoaders } from "./graphql/loaders.js";
import { createRealtimeSession } from "./services/realtimeSessionService.js";
import { createEvaluationService } from "./services/evaluationService.js";
import { createFollowupEmailService } from "./services/followupEmailService.js";
import { PostgresStore } from "./store/postgresStore.js";
import { createLogger } from "./utils/logger.js";
import { readRuntimeConfig } from "./db/env.js";
import { initializeDatabase } from "./db/initDb.js";
import { getUserFromHeaders } from "./auth/session.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";

const logger = createLogger("api");

async function bootstrap() {
  const config = readRuntimeConfig();

  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    application_name: "netai-api"
  });

  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 2,
    connectTimeout: 10_000,
    enableReadyCheck: true,
    lazyConnect: false
  });

  await pool.query("SELECT 1");
  await redis.ping();

  await initializeDatabase({ pool, logger });

  const store = new PostgresStore({ pool, redis, logger });
  const evaluationService = createEvaluationService({
    store,
    workerUrl: config.workerUrl,
    logger
  });
  const followupEmailService = createFollowupEmailService({
    store,
    openAiApiKey: config.openAiApiKey,
    model: config.followupEmailModel
  });

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
    graphqlEndpoint: "/graphql",
    maskedErrors: true,
    validationRules: [depthLimit(config.graphqlMaxDepth)],
    context: async ({ request }) => {
      const user = getUserFromHeaders({
        cookieHeader: request.headers.get("cookie") || "",
        authorizationHeader: request.headers.get("authorization") || "",
        jwtSecret: config.jwtSecret
      });

      return {
        user,
        loaders: createLoaders(store)
      };
    }
  });

  const app = express();
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );

  app.use("/v1", express.json({ limit: "1mb" }));

  registerAuthRoutes({ app, store, config, logger });

  const graphqlLimiter = rateLimit({
    windowMs: config.graphqlRateLimitWindowMs,
    max: config.graphqlRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      await redis.ping();
      res.json({ ok: true, service: "netai-api" });
    } catch (error) {
      res.status(503).json({ ok: false, error: error.message });
    }
  });

  app.post("/v1/realtime/sessions", async (req, res) => {
    try {
      const user = getUserFromHeaders({
        cookieHeader: req.headers.cookie || "",
        authorizationHeader: req.headers.authorization || "",
        jwtSecret: config.jwtSecret
      });
      if (!user?.id) {
        return res.status(401).json({ error: "UNAUTHENTICATED" });
      }

      const { model, voice } = req.body || {};

      const payload = await createRealtimeSession({
        openAiApiKey: config.openAiApiKey,
        model: model || config.openAiRealtimeModel,
        voice: voice || "alloy"
      });

      res.json(payload);
    } catch (error) {
      const statusCode =
        typeof error.status === "number" && error.status >= 400 && error.status < 600
          ? error.status
          : 500;

      logger.error("failed to create realtime session", {
        error: error.message,
        details: error.details
      });
      res.status(statusCode).json({
        error: error.message,
        details: error.details || ""
      });
    }
  });

  app.use("/graphql", graphqlLimiter, yoga);

  const server = app.listen(config.port, () => {
    logger.info("api started", { port: config.port });
  });

  async function shutdown(signal) {
    logger.info("api shutting down", { signal });
    server.close(async () => {
      await Promise.allSettled([pool.end(), redis.quit()]);
      process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  logger.error("api bootstrap failed", { error: error.message, stack: error.stack });
  process.exit(1);
});
