import DataLoader from "dataloader";

export function createLoaders(store) {
  return {
    sessionById: new DataLoader(async (ids) => store.getSessionsByIds(ids)),
    evaluationBySessionId: new DataLoader(async (ids) => store.getEvaluationsBySessionIds(ids))
  };
}
