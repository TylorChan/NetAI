export function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function readRuntimeConfig() {
  return {
    port: Number(process.env.PORT || 4000),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    openAiApiKey: readRequiredEnv("OPENAI_API_KEY"),
    openAiRealtimeModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
    followupEmailModel: process.env.FOLLOWUP_EMAIL_MODEL || "gpt-5.2",
    profileImageModel: process.env.PROFILE_IMAGE_MODEL || "gpt-5-mini",
    workerUrl: readRequiredEnv("WORKER_URL"),
    databaseUrl: readRequiredEnv("DATABASE_URL"),
    redisUrl: readRequiredEnv("REDIS_URL"),
    jwtSecret: readRequiredEnv("GRAPHQL_JWT_SECRET"),
    graphqlMaxDepth: Number(process.env.GRAPHQL_MAX_DEPTH || 8),
    graphqlRateLimitWindowMs: Number(process.env.GRAPHQL_RATE_LIMIT_WINDOW_MS || 60_000),
    graphqlRateLimitMax: Number(process.env.GRAPHQL_RATE_LIMIT_MAX || 120)
  };
}
