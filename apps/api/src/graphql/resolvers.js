import { z } from "zod";

const startNetworkingSessionInputSchema = z.object({
  userId: z.string().min(1),
  goal: z.string().min(1),
  targetProfileContext: z.string().optional().default(""),
  customContext: z.string().optional().default("")
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
      session: (_, { id }) => store.getSession(id),
      sessions: (_, { userId }) => store.listSessionsForUser(userId),
      getSessionResume: (_, { sessionId }) => store.getSessionResume(sessionId),
      getSessionEvaluation: (_, { sessionId }) => store.getEvaluation(sessionId)
    },
    Mutation: {
      startNetworkingSession: (_, { input }) => {
        const parsed = startNetworkingSessionInputSchema.parse(input);
        return store.createSession(parsed);
      },
      appendSessionTurn: (_, { input }) => {
        const parsed = appendSessionTurnInputSchema.parse(input);
        return store.appendTurn(parsed);
      },
      finalizeNetworkingSession: (_, { sessionId }) => {
        if (!sessionId) {
          throw new Error("sessionId is required");
        }

        const session = store.finalizeSession(sessionId);
        evaluationService.queueEvaluation(sessionId);

        return {
          session,
          queued: true,
          message: "Evaluation queued"
        };
      },
      generateFollowupEmail: (_, { input }) => {
        const parsed = generateFollowupEmailInputSchema.parse(input);
        return followupEmailService.generate(parsed);
      },
      saveVocabulary: (_, { input }) => {
        const parsed = vocabularyInputSchema.parse(input);
        return store.saveVocabulary(parsed);
      },
      startReviewSession: (_, { userId }) => {
        if (!userId) {
          throw new Error("userId is required");
        }

        return store.startReviewSession(userId);
      },
      saveReviewSession: (_, { updates }) => {
        const parsed = z.array(cardUpdateSchema).parse(updates);
        return store.saveReviewSession(parsed);
      }
    }
  };
}
