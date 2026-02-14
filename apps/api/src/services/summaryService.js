import { requestWorkerSummary } from "./workerClient.js";

const MAX_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [1200, 2500];
const SUMMARY_TURN_LIMIT = 120;
const INCREMENTAL_TURN_LIMIT = 80;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lastTurnTimestampIso(turns) {
  const tail = Array.isArray(turns) ? turns[turns.length - 1] : null;
  const ts = tail?.createdAt;
  return typeof ts === "string" && ts ? ts : null;
}

export function createSummaryService({ store, workerUrl, logger }) {
  async function queueSummary(sessionId) {
    const shouldRun = await store.tryMarkSummaryPending(sessionId, 25);
    if (!shouldRun) {
      return;
    }

    Promise.resolve().then(async () => {
      try {
        const session = await store.getSession(sessionId);
        if (!session) {
          return;
        }

        const cursorAt = session.summaryCursorAt;
        const newTurns = cursorAt
          ? await store.listTurnsAfter(sessionId, cursorAt, INCREMENTAL_TURN_LIMIT)
          : await store.listRecentTurns(sessionId, SUMMARY_TURN_LIMIT);

        if (!newTurns.length) {
          return;
        }

        let summary = null;
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          try {
            const result = await requestWorkerSummary({
              workerUrl,
              payload: {
                session,
                priorSummary: session.conversationSummary || "",
                newTurns
              }
            });

            summary = String(result?.summary || "").trim();
            if (!summary) {
              throw new Error("empty summary from worker");
            }
            break;
          } catch (error) {
            lastError = error;
            logger?.warn("summary attempt failed", { sessionId, attempt, error: error.message });
            if (attempt < MAX_ATTEMPTS) {
              await sleep(RETRY_DELAYS_MS[attempt - 1] || 1500);
            }
          }
        }

        if (!summary) {
          throw lastError || new Error("summary failed after retries");
        }

        await store.saveConversationSummary({
          sessionId,
          summary,
          cursorAt: lastTurnTimestampIso(newTurns)
        });

        logger?.info("summary updated", { sessionId });
      } catch (error) {
        logger?.warn("summary update failed", { sessionId, error: error.message });
      } finally {
        await store.clearSummaryPending(sessionId);
      }
    });
  }

  return { queueSummary };
}

