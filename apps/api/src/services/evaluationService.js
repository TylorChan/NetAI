import { requestWorkerEvaluation } from "./workerClient.js";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1500, 3000, 6000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createEvaluationService({ store, workerUrl, logger }) {
  async function queueEvaluation(sessionId) {
    const session = await store.getSession(sessionId);
    if (!session) {
      throw new Error("session not found");
    }

    const turns = await store.getTurns(sessionId);

    Promise.resolve().then(async () => {
      try {
        let evaluation = null;
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          try {
            evaluation = await requestWorkerEvaluation({
              workerUrl,
              payload: {
                session,
                turns
              }
            });
            break;
          } catch (error) {
            lastError = error;
            logger?.warn("evaluation attempt failed", {
              sessionId,
              attempt,
              error: error.message
            });

            if (attempt < MAX_ATTEMPTS) {
              await sleep(RETRY_DELAYS_MS[attempt - 1] || 2000);
            }
          }
        }

        if (!evaluation) {
          throw lastError || new Error("evaluation failed after retries");
        }

        await store.saveEvaluation(sessionId, evaluation);
        logger?.info("evaluation completed", { sessionId, score: evaluation.score });
      } catch (error) {
        await store.markEvaluationFailed(sessionId);
        logger?.error("evaluation failed", { sessionId, error: error.message });
      }
    });
  }

  return {
    queueEvaluation
  };
}
