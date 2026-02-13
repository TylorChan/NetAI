import { z } from "zod";

const startNetworkingSessionInputSchema = z.object({
  userId: z.string().min(1),
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
  videoTitle: z.string().optional(),
  userId: z.string().optional().default("default-user")
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

export function createResolvers({ store, evaluationService, followupEmailService, logger }) {
  return {
    Query: {
      ping: () => "pong",
      session: async (_, { id }, context) => context.loaders.sessionById.load(id),
      sessions: async (_, { userId }) => store.listSessionsForUser(userId),
      getSessionResume: async (_, { sessionId }) => store.getSessionResume(sessionId),
      getSessionEvaluation: async (_, { sessionId }, context) =>
        context.loaders.evaluationBySessionId.load(sessionId)
    },
    Mutation: {
      startNetworkingSession: async (_, { input }) => {
        const parsed = startNetworkingSessionInputSchema.parse(input);
        return store.createSession(parsed);
      },
      renameSession: async (_, { input }) => {
        const parsed = renameSessionInputSchema.parse(input);
        return store.renameSession({
          sessionId: parsed.sessionId,
          goal: parsed.goal.trim()
        });
      },
      deleteSession: async (_, { sessionId }) => {
        if (!sessionId?.trim()) {
          throw new Error("sessionId is required");
        }

        return store.deleteSession(sessionId.trim());
      },
      requestStageTransition: async (_, { input }) => {
        const parsed = requestStageTransitionInputSchema.parse(input);
        return store.requestStageTransition({
          sessionId: parsed.sessionId,
          targetStage: parsed.targetStage.trim(),
          requestedBy: parsed.requestedBy.trim(),
          reason: parsed.reason.trim()
        });
      },
      appendSessionTurn: async (_, { input }) => {
        const parsed = appendSessionTurnInputSchema.parse(input);
        return store.appendTurn(parsed);
      },
      finalizeNetworkingSession: async (_, { sessionId }) => {
        if (!sessionId) {
          throw new Error("sessionId is required");
        }

        const session = await store.finalizeSession(sessionId);
        await evaluationService.queueEvaluation(sessionId);

        return {
          session,
          queued: true,
          message: "Evaluation queued"
        };
      },
      generateFollowupEmail: async (_, { input }) => {
        const parsed = generateFollowupEmailInputSchema.parse(input);
        return followupEmailService.generate(parsed);
      },
      saveVocabulary: async (_, { input }) => {
        const parsed = vocabularyInputSchema.parse(input);
        return store.saveVocabulary(parsed);
      },
      startReviewSession: async (_, { userId }) => {
        if (!userId) {
          throw new Error("userId is required");
        }

        return store.startReviewSession(userId);
      },
      saveReviewSession: async (_, { updates }) => {
        const parsed = z.array(cardUpdateSchema).parse(updates);
        return store.saveReviewSession(parsed);
      }
    }
  };
}
