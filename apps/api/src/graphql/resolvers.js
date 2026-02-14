import { z } from "zod";

const startNetworkingSessionInputSchema = z.object({
  goal: z.string().min(1),
  targetProfileContext: z.string().optional().default(""),
  customContext: z.string().optional().default("")
});

const renameSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  goal: z
    .string()
    .min(1)
    .max(180)
    .refine((value) => value.trim().length > 0, "goal is required")
});

const requestStageTransitionInputSchema = z.object({
  sessionId: z.string().min(1),
  targetStage: z.string().min(1),
  requestedBy: z.string().optional().default("assistant"),
  reason: z.string().optional().default("")
});

const appendSessionTurnInputSchema = z.object({
  sessionId: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1)
});

const generateFollowupEmailInputSchema = z.object({
  sessionId: z.string().min(1),
  tone: z.string().optional().default("professional"),
  length: z.enum(["short", "medium", "long"]).optional().default("medium")
});

const vocabularyInputSchema = z.object({
  text: z.string().min(1),
  definition: z.string().min(1),
  example: z.string().optional(),
  exampleTrans: z.string().optional(),
  realLifeDef: z.string().optional(),
  surroundingText: z.string().optional(),
  videoTitle: z.string().optional()
});

const cardUpdateSchema = z.object({
  vocabularyId: z.string().min(1),
  difficulty: z.number().optional(),
  stability: z.number().optional(),
  dueDate: z.string().optional(),
  state: z.number().int().optional(),
  lastReview: z.string().optional(),
  reps: z.number().int().optional()
});

export function createResolvers({
  store,
  evaluationService,
  followupEmailService,
  summaryService,
  nudgeService,
  sessionMetadataService,
  logger
}) {
  function requireUser(context) {
    if (!context?.user?.id) {
      const error = new Error("UNAUTHENTICATED");
      error.code = "UNAUTHENTICATED";
      throw error;
    }
    return context.user;
  }

  async function requireOwnedSession({ sessionId, context }) {
    const user = requireUser(context);
    const session = await store.getSession(sessionId);
    if (!session) {
      throw new Error("session not found");
    }
    if (session.userId !== user.id) {
      const error = new Error("FORBIDDEN");
      error.code = "FORBIDDEN";
      throw error;
    }
    return session;
  }

  return {
    Query: {
      ping: () => "pong",
      me: async (_parent, _args, context) => {
        const user = context?.user;
        if (!user?.id) return null;
        const row = await store.getUserById(user.id);
        if (!row) return null;
        return {
          id: row.id,
          email: row.email,
          name: row.name,
          createdAt:
            typeof row.created_at === "string"
              ? row.created_at
              : new Date(row.created_at).toISOString()
        };
      },
      sessions: async (_parent, _args, context) => {
        const user = requireUser(context);
        return store.listSessionsForUser(user.id);
      },
      session: async (_parent, { id }, context) => {
        await requireOwnedSession({ sessionId: id, context });
        return context.loaders.sessionById.load(id);
      },
      getSessionResume: async (_parent, { sessionId }, context) => {
        await requireOwnedSession({ sessionId, context });
        return store.getSessionResume(sessionId);
      },
      getSessionEvaluation: async (_parent, { sessionId }, context) => {
        await requireOwnedSession({ sessionId, context });
        return context.loaders.evaluationBySessionId.load(sessionId);
      }
    },
    Mutation: {
      startNetworkingSession: async (_parent, { input }, context) => {
        const user = requireUser(context);
        const parsed = startNetworkingSessionInputSchema.parse(input);
        const session = await store.createSession({
          userId: user.id,
          goal: parsed.goal,
          targetProfileContext: parsed.targetProfileContext,
          customContext: parsed.customContext
        });

        await sessionMetadataService?.ensureMetadata?.(session.id);
        await nudgeService?.refreshNudgesNow?.(session.id);
        return store.getSession(session.id);
      },
      renameSession: async (_parent, { input }, context) => {
        await requireOwnedSession({ sessionId: input?.sessionId, context });
        const parsed = renameSessionInputSchema.parse(input);
        const session = await store.renameSession({
          sessionId: parsed.sessionId,
          goal: parsed.goal.trim()
        });

        await sessionMetadataService?.ensureMetadata?.(session.id);
        return store.getSession(session.id);
      },
      deleteSession: async (_parent, { sessionId }, context) => {
        if (!sessionId?.trim()) {
          throw new Error("sessionId is required");
        }

        await requireOwnedSession({ sessionId: sessionId.trim(), context });
        return store.deleteSession(sessionId.trim());
      },
      requestStageTransition: async (_parent, { input }, context) => {
        await requireOwnedSession({ sessionId: input?.sessionId, context });
        const parsed = requestStageTransitionInputSchema.parse(input);
        return store.requestStageTransition({
          sessionId: parsed.sessionId,
          targetStage: parsed.targetStage.trim(),
          requestedBy: parsed.requestedBy.trim(),
          reason: parsed.reason.trim()
        });
      },
      appendSessionTurn: async (_parent, { input }, context) => {
        await requireOwnedSession({ sessionId: input?.sessionId, context });
        const parsed = appendSessionTurnInputSchema.parse(input);
        const turn = await store.appendTurn(parsed);
        summaryService?.queueSummary?.(parsed.sessionId);
        if (parsed.role === "assistant") {
          nudgeService?.queueNudges?.(parsed.sessionId);
        }
        return turn;
      },
      finalizeNetworkingSession: async (_parent, { sessionId }, context) => {
        if (!sessionId) {
          throw new Error("sessionId is required");
        }

        await requireOwnedSession({ sessionId, context });
        const session = await store.finalizeSession(sessionId);
        await evaluationService.queueEvaluation(sessionId);

        return {
          session,
          queued: true,
          message: "Evaluation queued"
        };
      },
      generateFollowupEmail: async (_parent, { input }, context) => {
        await requireOwnedSession({ sessionId: input?.sessionId, context });
        const parsed = generateFollowupEmailInputSchema.parse(input);
        return followupEmailService.generate(parsed);
      },
      saveVocabulary: async (_parent, { input }, context) => {
        const user = requireUser(context);
        const parsed = vocabularyInputSchema.parse(input);
        return store.saveVocabulary({ ...parsed, userId: user.id });
      },
      startReviewSession: async (_parent, _args, context) => {
        const user = requireUser(context);
        return store.startReviewSession(user.id);
      },
      saveReviewSession: async (_parent, { updates }, context) => {
        requireUser(context);
        const parsed = z.array(cardUpdateSchema).parse(updates);
        return store.saveReviewSession(parsed);
      }
    }
  };
}
