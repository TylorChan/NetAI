// Always talk to same-origin /api routes. Those routes proxy to the real API server.
export const API_BASE_URL = "/api";

export const REALTIME_MODEL =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL || "gpt-realtime";
