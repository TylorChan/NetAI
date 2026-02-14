import { requestWorkerNudges } from "./workerClient.js";

const MAX_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [900, 1800];
const RECENT_TURNS = 14;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNudges(raw) {
  const nudges = Array.isArray(raw) ? raw : [];
  return nudges
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

async function computeNudges({ store, workerUrl, sessionId, logger }) {
  const session = await store.getSession(sessionId);
  if (!session) {
    return [];
  }

  const recentTurns = await store.listRecentTurns(sessionId, RECENT_TURNS);
  let nudgesPayload = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      nudgesPayload = await requestWorkerNudges({
        workerUrl,
        payload: {
          session,
          conversationSummary: session.conversationSummary || "",
          recentTurns
        }
      });
      break;
    } catch (error) {
      lastError = error;
      logger?.warn("nudges attempt failed", { sessionId, attempt, error: error.message });
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAYS_MS[attempt - 1] || 1000);
      }
    }
  }

  if (!nudgesPayload) {
    throw lastError || new Error("nudges failed after retries");
  }

  return normalizeNudges(nudgesPayload.nudges);
}

export function createNudgeService({ store, workerUrl, logger }) {
  async function refreshNudgesNow(sessionId) {
    try {
      const nudges = await computeNudges({ store, workerUrl, sessionId, logger });
      if (!nudges.length) {
        return [];
      }

      await store.saveTalkNudges({ sessionId, nudges });
      return nudges;
    } catch (error) {
      logger?.warn("nudges refresh failed", { sessionId, error: error.message });
      return [];
    }
  }

  async function queueNudges(sessionId) {
    const shouldRun = await store.tryMarkNudgesPending(sessionId, 10);
    if (!shouldRun) {
      return;
    }

    Promise.resolve().then(async () => {
      try {
        await refreshNudgesNow(sessionId);
      } finally {
        await store.clearNudgesPending(sessionId);
      }
    });
  }

  return {
    queueNudges,
    refreshNudgesNow
  };
}

