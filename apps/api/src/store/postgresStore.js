import { randomUUID } from "node:crypto";
import {
  evaluateStageTransition,
  getStageHint,
  normalizeRequestedStage,
  normalizeStage
} from "./networkingStage.js";

const SESSION_CACHE_TTL_SECONDS = 45;
const SESSIONS_LIST_CACHE_TTL_SECONDS = 30;
const EVALUATION_CACHE_TTL_SECONDS = 120;
const REVIEW_LIST_CACHE_TTL_SECONDS = 45;

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date(value).toISOString();
}

function mapSession(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    goal: row.goal,
    status: row.status,
    targetProfileContext: row.target_profile_context,
    customContext: row.custom_context,
    stageState: normalizeStage(row.stage_state),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    endedAt: toIso(row.ended_at)
  };
}

function mapTurn(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: toIso(row.created_at)
  };
}

function mapEvaluation(row) {
  if (!row) {
    return null;
  }

  return {
    sessionId: row.session_id,
    score: row.score,
    strengths: row.strengths,
    improvements: row.improvements,
    nextActions: row.next_actions,
    followUpEmail: row.follow_up_email,
    createdAt: toIso(row.created_at)
  };
}

function mapVocabularyEntry(row) {
  return {
    id: row.id,
    text: row.text,
    definition: row.definition,
    example: row.example,
    exampleTrans: row.example_trans,
    realLifeDef: row.real_life_def,
    surroundingText: row.surrounding_text,
    videoTitle: row.video_title,
    userId: row.user_id,
    createdAt: toIso(row.created_at),
    fsrsCard: {
      difficulty: row.difficulty,
      stability: row.stability,
      dueDate: toIso(row.due_date),
      state: row.state,
      lastReview: toIso(row.last_review),
      reps: row.reps
    }
  };
}

function sessionCacheKey(sessionId) {
  return `session:${sessionId}`;
}

function sessionsListCacheKey(userId) {
  return `sessions:user:${userId}`;
}

function evaluationCacheKey(sessionId) {
  return `evaluation:${sessionId}`;
}

function reviewSessionCacheKey(userId) {
  return `review:due:${userId}`;
}

export class PostgresStore {
  constructor({ pool, redis, logger }) {
    this.pool = pool;
    this.redis = redis;
    this.logger = logger;
  }

  async cacheGet(key) {
    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      this.logger?.warn("redis cache get failed", { key, error: error.message });
      return null;
    }
  }

  async cacheSet(key, value, ttlSeconds) {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logger?.warn("redis cache set failed", { key, error: error.message });
    }
  }

  async cacheDel(...keys) {
    try {
      const filtered = keys.filter(Boolean);
      if (filtered.length > 0) {
        await this.redis.del(filtered);
      }
    } catch (error) {
      this.logger?.warn("redis cache del failed", { keys, error: error.message });
    }
  }

  async deleteKeysByPrefix(prefix) {
    try {
      let cursor = "0";
      const keys = [];

      do {
        const [nextCursor, batch] = await this.redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== "0");

      if (keys.length) {
        await this.redis.del(keys);
      }
    } catch (error) {
      this.logger?.warn("redis prefix delete failed", { prefix, error: error.message });
    }
  }

  async getSession(sessionId) {
    const key = sessionCacheKey(sessionId);
    const cached = await this.cacheGet(key);
    if (cached) {
      return cached;
    }

    const result = await this.pool.query(
      `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
      [sessionId]
    );

    const session = mapSession(result.rows[0]);
    if (session) {
      await this.cacheSet(key, session, SESSION_CACHE_TTL_SECONDS);
    }

    return session;
  }

  async getSessionsByIds(sessionIds) {
    if (!sessionIds.length) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT * FROM sessions WHERE id = ANY($1::text[])`,
      [sessionIds]
    );

    const byId = new Map(result.rows.map((row) => [row.id, mapSession(row)]));
    return sessionIds.map((id) => byId.get(id) || null);
  }

  async listSessionsForUser(userId) {
    const key = sessionsListCacheKey(userId);
    const cached = await this.cacheGet(key);
    if (cached) {
      return cached;
    }

    const result = await this.pool.query(
      `
      SELECT *
      FROM sessions
      WHERE user_id = $1
      ORDER BY updated_at DESC
      `,
      [userId]
    );

    const sessions = result.rows.map(mapSession);
    await this.cacheSet(key, sessions, SESSIONS_LIST_CACHE_TTL_SECONDS);
    return sessions;
  }

  async createSession({ userId, goal, targetProfileContext = "", customContext = "" }) {
    const id = randomUUID();
    const ts = nowIso();
    const normalizedTarget = targetProfileContext.trim();
    const normalizedCustom = customContext.trim();
    const defaultContext =
      "Default networking context: friendly small talk, role exploration, and actionable recruiting advice.";
    const finalTarget = normalizedTarget || (normalizedCustom ? "" : defaultContext);

    const result = await this.pool.query(
      `
      INSERT INTO sessions (
        id,
        user_id,
        goal,
        status,
        target_profile_context,
        custom_context,
        stage_state,
        created_at,
        updated_at,
        ended_at
      )
      VALUES ($1, $2, $3, 'ACTIVE', $4, $5, 'SMALL_TALK', $6, $6, NULL)
      RETURNING *
      `,
      [id, userId, goal, finalTarget, normalizedCustom, ts]
    );

    const session = mapSession(result.rows[0]);
    await this.cacheDel(sessionsListCacheKey(userId));
    await this.cacheSet(sessionCacheKey(session.id), session, SESSION_CACHE_TTL_SECONDS);

    return session;
  }

  async renameSession({ sessionId, goal }) {
    const result = await this.pool.query(
      `
      UPDATE sessions
      SET goal = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [sessionId, goal]
    );

    if (!result.rows.length) {
      throw new Error("session not found");
    }

    const session = mapSession(result.rows[0]);
    await this.cacheDel(
      sessionCacheKey(session.id),
      sessionsListCacheKey(session.userId)
    );
    await this.cacheSet(sessionCacheKey(session.id), session, SESSION_CACHE_TTL_SECONDS);

    return session;
  }

  async deleteSession(sessionId) {
    const result = await this.pool.query(
      `
      DELETE FROM sessions
      WHERE id = $1
      RETURNING id, user_id
      `,
      [sessionId]
    );

    if (!result.rows.length) {
      throw new Error("session not found");
    }

    const row = result.rows[0];
    await this.cacheDel(
      sessionCacheKey(sessionId),
      sessionsListCacheKey(row.user_id),
      evaluationCacheKey(sessionId)
    );

    return {
      sessionId: row.id,
      deleted: true
    };
  }

  async requestStageTransition({ sessionId, targetStage, requestedBy = "assistant", reason = "" }) {
    const normalizedTarget = normalizeRequestedStage(targetStage);
    if (!normalizedTarget) {
      throw new Error("Invalid target stage");
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const sessionResult = await client.query(
        `SELECT * FROM sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );

      if (!sessionResult.rows.length) {
        throw new Error("session not found");
      }

      const currentSession = mapSession(sessionResult.rows[0]);
      const transition = evaluateStageTransition({
        currentStage: currentSession.stageState,
        targetStage: normalizedTarget
      });

      let nextSession = currentSession;
      if (transition.applied) {
        const updateResult = await client.query(
          `
          UPDATE sessions
          SET stage_state = $2, updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [sessionId, transition.nextStage]
        );
        nextSession = mapSession(updateResult.rows[0]);
      }

      await client.query("COMMIT");

      await this.cacheDel(
        sessionCacheKey(sessionId),
        sessionsListCacheKey(nextSession.userId)
      );
      await this.cacheSet(sessionCacheKey(sessionId), nextSession, SESSION_CACHE_TTL_SECONDS);

      return {
        session: nextSession,
        applied: transition.applied,
        reason: transition.applied
          ? `${transition.reason}${reason ? ` (${reason})` : ""}`
          : transition.reason
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      this.logger?.info("stage transition requested", {
        sessionId,
        targetStage: normalizedTarget,
        requestedBy
      });
    }
  }

  async appendTurn({ sessionId, role, content }) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const sessionResult = await client.query(
        `SELECT id, user_id, stage_state FROM sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );

      if (!sessionResult.rows.length) {
        throw new Error("session not found");
      }

      const turnId = randomUUID();
      const createdAt = nowIso();

      const turnResult = await client.query(
        `
        INSERT INTO session_turns (id, session_id, role, content, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [turnId, sessionId, role, content, createdAt]
      );

      await client.query(
        `
        UPDATE sessions
        SET updated_at = $2, stage_state = $3
        WHERE id = $1
        `,
        [sessionId, createdAt, normalizeStage(sessionResult.rows[0].stage_state)]
      );

      await client.query("COMMIT");

      const userId = sessionResult.rows[0].user_id;
      await this.cacheDel(
        sessionCacheKey(sessionId),
        sessionsListCacheKey(userId)
      );

      return mapTurn(turnResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTurns(sessionId) {
    const result = await this.pool.query(
      `
      SELECT *
      FROM session_turns
      WHERE session_id = $1
      ORDER BY created_at ASC
      `,
      [sessionId]
    );

    return result.rows.map(mapTurn);
  }

  async getSessionResume(sessionId, recentCount = 40) {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const turnsResult = await this.pool.query(
      `
      SELECT *
      FROM session_turns
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [sessionId, recentCount]
    );

    const recentTurns = turnsResult.rows.reverse().map(mapTurn);

    return {
      session,
      recentTurns,
      contextSummary:
        session.customContext ||
        session.targetProfileContext ||
        "Default networking context",
      stageHint: getStageHint(session.stageState)
    };
  }

  async finalizeSession(sessionId) {
    const result = await this.pool.query(
      `
      UPDATE sessions
      SET
        status = 'PROCESSING_EVALUATION',
        ended_at = COALESCE(ended_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [sessionId]
    );

    if (!result.rows.length) {
      throw new Error("session not found");
    }

    const session = mapSession(result.rows[0]);
    await this.cacheDel(
      sessionCacheKey(sessionId),
      sessionsListCacheKey(session.userId),
      evaluationCacheKey(sessionId)
    );

    return session;
  }

  async markEvaluationDone(sessionId) {
    const result = await this.pool.query(
      `
      UPDATE sessions
      SET status = 'EVALUATED', updated_at = NOW()
      WHERE id = $1
      RETURNING user_id
      `,
      [sessionId]
    );

    if (result.rows.length) {
      await this.cacheDel(
        sessionCacheKey(sessionId),
        sessionsListCacheKey(result.rows[0].user_id)
      );
    }
  }

  async markEvaluationFailed(sessionId) {
    const result = await this.pool.query(
      `
      UPDATE sessions
      SET status = 'EVALUATION_FAILED', updated_at = NOW()
      WHERE id = $1
      RETURNING user_id
      `,
      [sessionId]
    );

    if (result.rows.length) {
      await this.cacheDel(
        sessionCacheKey(sessionId),
        sessionsListCacheKey(result.rows[0].user_id)
      );
    }
  }

  async saveEvaluation(sessionId, evaluation) {
    const ts = nowIso();

    const result = await this.pool.query(
      `
      INSERT INTO session_evaluations (
        session_id,
        score,
        strengths,
        improvements,
        next_actions,
        follow_up_email,
        created_at
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
      ON CONFLICT (session_id) DO UPDATE
      SET
        score = EXCLUDED.score,
        strengths = EXCLUDED.strengths,
        improvements = EXCLUDED.improvements,
        next_actions = EXCLUDED.next_actions,
        follow_up_email = EXCLUDED.follow_up_email,
        created_at = EXCLUDED.created_at
      RETURNING *
      `,
      [
        sessionId,
        evaluation.score,
        JSON.stringify(evaluation.strengths || []),
        JSON.stringify(evaluation.improvements || []),
        JSON.stringify(evaluation.nextActions || []),
        evaluation.followUpEmail || "",
        ts
      ]
    );

    await this.markEvaluationDone(sessionId);

    const payload = mapEvaluation(result.rows[0]);
    await this.cacheSet(evaluationCacheKey(sessionId), payload, EVALUATION_CACHE_TTL_SECONDS);

    return payload;
  }

  async getEvaluation(sessionId) {
    const key = evaluationCacheKey(sessionId);
    const cached = await this.cacheGet(key);
    if (cached) {
      return cached;
    }

    const result = await this.pool.query(
      `SELECT * FROM session_evaluations WHERE session_id = $1 LIMIT 1`,
      [sessionId]
    );

    const evaluation = mapEvaluation(result.rows[0]);
    if (evaluation) {
      await this.cacheSet(key, evaluation, EVALUATION_CACHE_TTL_SECONDS);
    }

    return evaluation;
  }

  async getEvaluationsBySessionIds(sessionIds) {
    if (!sessionIds.length) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT * FROM session_evaluations WHERE session_id = ANY($1::text[])`,
      [sessionIds]
    );

    const byId = new Map(result.rows.map((row) => [row.session_id, mapEvaluation(row)]));
    return sessionIds.map((id) => byId.get(id) || null);
  }

  async saveVocabulary(input) {
    const id = randomUUID();
    const ts = nowIso();

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const vocabResult = await client.query(
        `
        INSERT INTO vocabulary_entries (
          id,
          user_id,
          text,
          definition,
          example,
          example_trans,
          real_life_def,
          surrounding_text,
          video_title,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        `,
        [
          id,
          input.userId || "default-user",
          input.text,
          input.definition,
          input.example || "",
          input.exampleTrans || "",
          input.realLifeDef || "",
          input.surroundingText || "",
          input.videoTitle || "",
          ts
        ]
      );

      await client.query(
        `
        INSERT INTO vocabulary_fsrs_cards (
          vocabulary_id,
          difficulty,
          stability,
          due_date,
          state,
          last_review,
          reps
        )
        VALUES ($1, 5, 1, $2, 0, $2, 0)
        `,
        [id, ts]
      );

      await client.query("COMMIT");

      await this.cacheDel(reviewSessionCacheKey(input.userId || "default-user"));

      const merged = {
        ...vocabResult.rows[0],
        difficulty: 5,
        stability: 1,
        due_date: ts,
        state: 0,
        last_review: ts,
        reps: 0
      };

      return mapVocabularyEntry(merged);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async startReviewSession(userId) {
    const key = reviewSessionCacheKey(userId);
    const cached = await this.cacheGet(key);
    if (cached) {
      return cached;
    }

    const result = await this.pool.query(
      `
      SELECT
        v.*,
        c.difficulty,
        c.stability,
        c.due_date,
        c.state,
        c.last_review,
        c.reps
      FROM vocabulary_entries v
      JOIN vocabulary_fsrs_cards c ON c.vocabulary_id = v.id
      WHERE v.user_id = $1
        AND c.due_date <= NOW()
      ORDER BY c.due_date ASC
      `,
      [userId]
    );

    const entries = result.rows.map(mapVocabularyEntry);
    await this.cacheSet(key, entries, REVIEW_LIST_CACHE_TTL_SECONDS);

    return entries;
  }

  async saveReviewSession(updates) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      let savedCount = 0;

      for (const update of updates) {
        const result = await client.query(
          `
          UPDATE vocabulary_fsrs_cards
          SET
            difficulty = COALESCE($2, difficulty),
            stability = COALESCE($3, stability),
            due_date = COALESCE($4::timestamptz, due_date),
            state = COALESCE($5, state),
            last_review = COALESCE($6::timestamptz, last_review),
            reps = COALESCE($7, reps)
          WHERE vocabulary_id = $1
          `,
          [
            update.vocabularyId,
            update.difficulty ?? null,
            update.stability ?? null,
            update.dueDate ?? null,
            update.state ?? null,
            update.lastReview ?? null,
            update.reps ?? null
          ]
        );

        if (result.rowCount > 0) {
          savedCount += 1;
        }
      }

      await client.query("COMMIT");
      await this.deleteKeysByPrefix("review:due:");

      return {
        success: true,
        savedCount,
        message: `Saved ${savedCount} update(s)`
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
