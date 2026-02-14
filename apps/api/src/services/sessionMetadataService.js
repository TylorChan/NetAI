import { requestWorkerSessionMetadata } from "./workerClient.js";

const MAX_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [1100, 2200];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackTitle(goal) {
  const text = String(goal || "").trim();
  if (!text) return "Networking Session";
  return text.length > 56 ? `${text.slice(0, 55).trim()}…` : text;
}

function fallbackGoalSummary(goal) {
  const text = String(goal || "").trim();
  if (!text) return "Have a clear, natural networking conversation.";
  return text.length > 90 ? `${text.slice(0, 89).trim()}…` : text;
}

function normalizeMetadata(payload, goal) {
  const displayTitle = String(payload?.displayTitle || payload?.title || "").trim();
  const goalSummary = String(payload?.goalSummary || "").trim();

  return {
    displayTitle: displayTitle || fallbackTitle(goal),
    goalSummary: goalSummary || fallbackGoalSummary(goal)
  };
}

export function createSessionMetadataService({ store, workerUrl, logger }) {
  async function ensureMetadata(sessionId) {
    const session = await store.getSession(sessionId);
    if (!session) {
      throw new Error("session not found");
    }

    let metadata = null;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        metadata = await requestWorkerSessionMetadata({
          workerUrl,
          payload: {
            goal: session.goal,
            targetProfileContext: session.targetProfileContext || "",
            customContext: session.customContext || ""
          }
        });
        break;
      } catch (error) {
        lastError = error;
        logger?.warn("session metadata attempt failed", { sessionId, attempt, error: error.message });
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAYS_MS[attempt - 1] || 1500);
        }
      }
    }

    const normalized = normalizeMetadata(metadata || {}, session.goal);
    await store.saveSessionMetadata({ sessionId, ...normalized });
    return store.getSession(sessionId);
  }

  return { ensureMetadata };
}

