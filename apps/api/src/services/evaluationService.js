import { requestWorkerEvaluation } from "./workerClient.js";

export function createEvaluationService({ store, workerUrl, logger }) {
  async function queueEvaluation(sessionId) {
    const session = store.getSession(sessionId);
    if (!session) {
      throw new Error("session not found");
    }

    const turns = store.getTurns(sessionId);

    Promise.resolve().then(async () => {
      try {
        const evaluation = await requestWorkerEvaluation({
          workerUrl,
          payload: {
            session,
            turns
          }
        });

        store.saveEvaluation(sessionId, evaluation);
        logger?.info("evaluation completed", { sessionId, score: evaluation.score });
      } catch (error) {
        store.markEvaluationFailed(sessionId);
        logger?.error("evaluation failed", { sessionId, error: error.message });
      }
    });
  }

  return {
    queueEvaluation
  };
}
