import { randomUUID } from "node:crypto";

function nowIso() {
  return new Date().toISOString();
}

export class MemoryStore {
  constructor() {
    this.sessions = new Map();
    this.sessionTurns = new Map();
    this.evaluations = new Map();
    this.vocabulary = new Map();
  }

  createSession({ userId, goal, targetProfileContext = "", customContext = "" }) {
    const id = randomUUID();
    const ts = nowIso();
    const session = {
      id,
      userId,
      goal,
      status: "ACTIVE",
      targetProfileContext,
      customContext,
      stageState: "NEED_STAGE",
      createdAt: ts,
      updatedAt: ts,
      endedAt: null
    };

    this.sessions.set(id, session);
    this.sessionTurns.set(id, []);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  listSessionsForUser(userId) {
    return [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  appendTurn({ sessionId, role, content }) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error("session not found");
    }

    const turn = {
      id: randomUUID(),
      sessionId,
      role,
      content,
      createdAt: nowIso()
    };

    const turns = this.sessionTurns.get(sessionId) ?? [];
    turns.push(turn);
    this.sessionTurns.set(sessionId, turns);
    session.updatedAt = nowIso();

    return turn;
  }

  getTurns(sessionId) {
    return this.sessionTurns.get(sessionId) ?? [];
  }

  getSessionResume(sessionId, recentCount = 40) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const turns = this.getTurns(sessionId);
    const recentTurns = turns.slice(-recentCount);
    return {
      session,
      recentTurns,
      contextSummary: session.customContext || session.targetProfileContext || "Default networking context"
    };
  }

  finalizeSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error("session not found");
    }

    session.status = "PROCESSING_EVALUATION";
    session.endedAt = nowIso();
    session.updatedAt = nowIso();
    return session;
  }

  markEvaluationDone(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.status = "EVALUATED";
    session.updatedAt = nowIso();
  }

  markEvaluationFailed(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    session.status = "EVALUATION_FAILED";
    session.updatedAt = nowIso();
  }

  saveEvaluation(sessionId, evaluation) {
    const payload = {
      sessionId,
      ...evaluation,
      createdAt: nowIso()
    };

    this.evaluations.set(sessionId, payload);
    this.markEvaluationDone(sessionId);
    return payload;
  }

  getEvaluation(sessionId) {
    return this.evaluations.get(sessionId) ?? null;
  }

  saveVocabulary(input) {
    const id = randomUUID();
    const entry = {
      id,
      text: input.text,
      definition: input.definition,
      example: input.example || "",
      exampleTrans: input.exampleTrans || "",
      realLifeDef: input.realLifeDef || "",
      surroundingText: input.surroundingText || "",
      videoTitle: input.videoTitle || "",
      userId: input.userId || "default-user",
      createdAt: nowIso(),
      fsrsCard: {
        difficulty: 5,
        stability: 1,
        dueDate: nowIso(),
        state: 0,
        lastReview: nowIso(),
        reps: 0
      }
    };

    this.vocabulary.set(id, entry);
    return entry;
  }

  startReviewSession(userId) {
    const now = nowIso();
    return [...this.vocabulary.values()]
      .filter((entry) => entry.userId === userId)
      .filter((entry) => !entry.fsrsCard?.dueDate || entry.fsrsCard.dueDate <= now)
      .sort((a, b) => a.fsrsCard.dueDate.localeCompare(b.fsrsCard.dueDate));
  }

  saveReviewSession(updates) {
    let savedCount = 0;

    for (const update of updates) {
      const entry = this.vocabulary.get(update.vocabularyId);
      if (!entry) {
        continue;
      }

      entry.fsrsCard = {
        difficulty: update.difficulty ?? entry.fsrsCard.difficulty,
        stability: update.stability ?? entry.fsrsCard.stability,
        dueDate: update.dueDate ?? entry.fsrsCard.dueDate,
        state: update.state ?? entry.fsrsCard.state,
        lastReview: update.lastReview ?? entry.fsrsCard.lastReview,
        reps: update.reps ?? entry.fsrsCard.reps
      };

      savedCount += 1;
    }

    return {
      success: true,
      savedCount,
      message: `Saved ${savedCount} update(s)`
    };
  }
}
