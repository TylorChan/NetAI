import { randomUUID } from "node:crypto";
import {
  evaluateStageTransition,
  getStageHint,
  normalizeRequestedStage,
  normalizeStage,
  shouldAdvanceStage,
  updateStageSignals
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

  let talkNudges = [];
  if (Array.isArray(row.talk_nudges)) {
    talkNudges = row.talk_nudges;
  } else if (typeof row.talk_nudges === "string") {
    try {
      const parsed = JSON.parse(row.talk_nudges);
      if (Array.isArray(parsed)) {
        talkNudges = parsed;
      }
    } catch {
      talkNudges = [];
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    goal: row.goal,
    displayTitle: row.display_title || "",
    goalSummary: row.goal_summary || "",
    status: row.status,
    targetProfileContext: row.target_profile_context,
    customContext: row.custom_context,
    stageState: normalizeStage(row.stage_state),
    stageEnteredAt: toIso(row.stage_entered_at) || toIso(row.created_at),
    stageUserTurns: Number.isFinite(Number(row.stage_user_turns)) ? Number(row.stage_user_turns) : 0,
    stageSignalFlags:
      row.stage_signal_flags && typeof row.stage_signal_flags === "object"
        ? row.stage_signal_flags
        : typeof row.stage_signal_flags === "string"
          ? (() => {
              try {
                return JSON.parse(row.stage_signal_flags);
              } catch {
                return {};
              }
            })()
          : {},
    conversationSummary: row.conversation_summary || "",
    talkNudges,
    followupEmailSubject: row.followup_email_subject || "",
    followupEmailBody: row.followup_email_body || "",
    followupEmailUpdatedAt: toIso(row.followup_email_updated_at),
    summaryCursorAt: toIso(row.summary_cursor_at),
    summaryUpdatedAt: toIso(row.summary_updated_at),
    nudgesUpdatedAt: toIso(row.nudges_updated_at),
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

function summaryPendingKey(sessionId) {
  return `summary:pending:${sessionId}`;
}

function nudgesPendingKey(sessionId) {
  return `nudges:pending:${sessionId}`;
}

export class PostgresStore {
  constructor({ pool, redis, logger }) {
    this.pool = pool;
    this.redis = redis;
    this.logger = logger;
  }

  async tryMarkSummaryPending(sessionId, ttlSeconds = 25) {
    try {
      const key = summaryPendingKey(sessionId);
      const result = await this.redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    } catch (error) {
      this.logger?.warn("summary pending mark failed", { sessionId, error: error.message });
      return true;
    }
  }

  async clearSummaryPending(sessionId) {
    try {
      await this.redis.del(summaryPendingKey(sessionId));
    } catch (error) {
      this.logger?.warn("summary pending clear failed", { sessionId, error: error.message });
    }
  }

  async tryMarkNudgesPending(sessionId, ttlSeconds = 10) {
    try {
      const key = nudgesPendingKey(sessionId);
      const result = await this.redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    } catch (error) {
      this.logger?.warn("nudges pending mark failed", { sessionId, error: error.message });
      return true;
    }
  }

  async clearNudgesPending(sessionId) {
    try {
      await this.redis.del(nudgesPendingKey(sessionId));
    } catch (error) {
      this.logger?.warn("nudges pending clear failed", { sessionId, error: error.message });
    }
  }

  async listTurnsAfter(sessionId, afterIso, limit = 80) {
    if (!afterIso) {
      return [];
    }

    const result = await this.pool.query(
      `
      SELECT *
      FROM session_turns
      WHERE session_id = $1
        AND created_at > $2::timestamptz
      ORDER BY created_at ASC
      LIMIT $3
      `,
      [sessionId, afterIso, limit]
    );

    return result.rows.map(mapTurn);
  }

  async listRecentTurns(sessionId, limit = 60) {
    const result = await this.pool.query(
      `
      SELECT *
      FROM session_turns
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [sessionId, limit]
    );

    return result.rows.reverse().map(mapTurn);
  }

  async saveConversationSummary({ sessionId, summary, cursorAt }) {
    const result = await this.pool.query(
      `
      UPDATE sessions
      SET
        conversation_summary = $2,
        summary_cursor_at = $3::timestamptz,
        summary_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING user_id
      `,
      [sessionId, summary || "", cursorAt || null]
    );

    if (result.rows?.length) {
      const userId = result.rows[0].user_id;
      await this.cacheDel(sessionCacheKey(sessionId), sessionsListCacheKey(userId));
    }
  }

  async saveSessionMetadata({ sessionId, displayTitle, goalSummary }) {
    const result = await this.pool.query(
      `
      UPDATE sessions
      SET
        display_title = $2,
        goal_summary = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING user_id
      `,
      [sessionId, String(displayTitle || "").trim(), String(goalSummary || "").trim()]
    );

    if (result.rows?.length) {
      const userId = result.rows[0].user_id;
      await this.cacheDel(sessionCacheKey(sessionId), sessionsListCacheKey(userId));
    }
  }

  async saveTalkNudges({ sessionId, nudges }) {
    const cleaned = Array.isArray(nudges)
      ? nudges.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 2)
      : [];

    const result = await this.pool.query(
      `
      UPDATE sessions
      SET
        talk_nudges = $2::jsonb,
        nudges_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING user_id
      `,
      [sessionId, JSON.stringify(cleaned)]
    );

    if (result.rows?.length) {
      const userId = result.rows[0].user_id;
      await this.cacheDel(sessionCacheKey(sessionId), sessionsListCacheKey(userId));
    }
  }

  async saveFollowupEmailDraft({ sessionId, subject, body }) {
    const cleanedSubject = String(subject || "").trim();
    const cleanedBody = String(body || "").trim();

    const result = await this.pool.query(
      `
      UPDATE sessions
      SET
        followup_email_subject = $2,
        followup_email_body = $3,
        followup_email_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING user_id
      `,
      [sessionId, cleanedSubject, cleanedBody]
    );

    if (result.rows?.length) {
      const userId = result.rows[0].user_id;
      await this.cacheDel(sessionCacheKey(sessionId), sessionsListCacheKey(userId));
    }
  }

  async countUsers() {
    const result = await this.pool.query(`SELECT COUNT(*)::int AS count FROM users`);
    return result.rows?.[0]?.count || 0;
  }

  async getUserByEmail(email) {
    const result = await this.pool.query(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [email]);
    return result.rows[0] || null;
  }

  async getUserById(id) {
    const result = await this.pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] || null;
  }

  async createUser({ id, email, name, passwordHash }) {
    const ts = nowIso();
    const result = await this.pool.query(
      `
      INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING *
      `,
      [id, email, name, passwordHash, ts]
    );

    return result.rows[0];
  }

  async migrateLegacyDefaultUser({ newUserId }) {
    const legacyId = "default-user";
    await this.pool.query(`UPDATE sessions SET user_id = $1 WHERE user_id = $2`, [newUserId, legacyId]);
    await this.pool.query(`UPDATE vocabulary_entries SET user_id = $1 WHERE user_id = $2`, [
      newUserId,
      legacyId
    ]);
    await this.cacheDel(sessionsListCacheKey(legacyId), sessionsListCacheKey(newUserId));
    await this.deleteKeysByPrefix("session:");
    await this.deleteKeysByPrefix("evaluation:");
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
        stage_entered_at,
        stage_user_turns,
        stage_signal_flags,
        created_at,
        updated_at,
        ended_at
      )
      VALUES ($1, $2, $3, 'ACTIVE', $4, $5, 'SMALL_TALK', $6, 0, '{}'::jsonb, $6, $6, NULL)
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
        const policy = shouldAdvanceStage({
          currentStage: currentSession.stageState,
          stageEnteredAt: currentSession.stageEnteredAt,
          stageUserTurns: currentSession.stageUserTurns,
          stageSignalFlags: currentSession.stageSignalFlags,
          // Use deterministic stored signals/turn counts. Do not treat "reason" as user content.
          latestUserContent: "",
          isRequested: true
        });

        if (!policy.advance || policy.nextStage !== transition.nextStage) {
          transition.applied = false;
          transition.reason = policy.reason || "Stage transition not allowed yet";
        }
      }

      if (transition.applied) {
        const updateResult = await client.query(
          `
          UPDATE sessions
          SET
            stage_state = $2,
            stage_entered_at = NOW(),
            stage_user_turns = 0,
            stage_signal_flags = '{}'::jsonb,
            updated_at = NOW()
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
        `SELECT * FROM sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );

      if (!sessionResult.rows.length) {
        throw new Error("session not found");
      }

      const currentSession = mapSession(sessionResult.rows[0]);
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

      let nextStageState = currentSession.stageState;
      let nextStageEnteredAt = currentSession.stageEnteredAt || createdAt;
      let nextStageUserTurns = currentSession.stageUserTurns || 0;
      let nextSignalFlags = currentSession.stageSignalFlags || {};

      const trimmedContent = String(content || "").trim();
      const isUserTurn = role === "user";
      if (isUserTurn) {
        nextStageUserTurns = nextStageUserTurns + 1;
        nextSignalFlags = updateStageSignals({
          stage: nextStageState,
          flags: nextSignalFlags,
          latestUserContent: trimmedContent
        });
      }

      await client.query(
        `
        UPDATE sessions
        SET
          updated_at = $2,
          stage_state = $3,
          stage_entered_at = $4::timestamptz,
          stage_user_turns = $5,
          stage_signal_flags = $6::jsonb
        WHERE id = $1
        `,
        [
          sessionId,
          createdAt,
          normalizeStage(nextStageState),
          nextStageEnteredAt || createdAt,
          nextStageUserTurns,
          JSON.stringify(nextSignalFlags || {})
        ]
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
    const followupEmail =
      session.followupEmailSubject?.trim() && session.followupEmailBody?.trim()
        ? {
            subject: session.followupEmailSubject.trim(),
            body: session.followupEmailBody.trim()
          }
        : null;

    return {
      session,
      recentTurns,
      contextSummary:
        session.customContext ||
        session.targetProfileContext ||
        "Default networking context",
      conversationSummary: session.conversationSummary || "",
      talkNudges: session.talkNudges || [],
      followupEmail,
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
    const userId = input.userId;
    if (!userId) {
      throw new Error("userId is required");
    }

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
          userId,
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

      await this.cacheDel(reviewSessionCacheKey(userId));

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
