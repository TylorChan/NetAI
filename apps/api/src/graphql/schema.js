export const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    email: String!
    name: String!
    createdAt: String!
  }

  type Session {
    id: ID!
    userId: String!
    goal: String!
    displayTitle: String!
    goalSummary: String!
    status: String!
    targetProfileContext: String
    customContext: String
    stageState: String!
    talkNudges: [String!]!
    createdAt: String!
    updatedAt: String!
    endedAt: String
  }

  type SessionTurn {
    id: ID!
    sessionId: ID!
    role: String!
    content: String!
    createdAt: String!
  }

  type SessionEvaluation {
    sessionId: ID!
    score: Int!
    strengths: [String!]!
    improvements: [String!]!
    nextActions: [String!]!
    followUpEmail: String!
    createdAt: String!
  }

  type NetworkingSessionResume {
    session: Session!
    recentTurns: [SessionTurn!]!
    contextSummary: String!
    conversationSummary: String!
    talkNudges: [String!]!
    stageHint: String!
  }

  type FollowupEmailSuggestion {
    subject: String!
    body: String!
  }

  type FinalizeNetworkingSessionPayload {
    session: Session!
    queued: Boolean!
    message: String!
  }

  type DeleteSessionPayload {
    sessionId: ID!
    deleted: Boolean!
  }

  type StageTransitionPayload {
    session: Session!
    applied: Boolean!
    reason: String!
  }

  input StartNetworkingSessionInput {
    goal: String!
    targetProfileContext: String
    customContext: String
  }

  input AppendSessionTurnInput {
    sessionId: ID!
    role: String!
    content: String!
  }

  input GenerateFollowupEmailInput {
    sessionId: ID!
    tone: String
    length: String
  }

  input RenameSessionInput {
    sessionId: ID!
    goal: String!
  }

  input RequestStageTransitionInput {
    sessionId: ID!
    targetStage: String!
    requestedBy: String
    reason: String
  }

  type VocabularyEntry {
    id: ID!
    text: String!
    definition: String!
    example: String
    exampleTrans: String
    realLifeDef: String
    surroundingText: String
    videoTitle: String
    userId: String!
    createdAt: String!
    fsrsCard: FsrsCard!
  }

  type FsrsCard {
    difficulty: Float!
    stability: Float!
    dueDate: String!
    state: Int!
    lastReview: String!
    reps: Int!
  }

  type SaveReviewSessionPayload {
    success: Boolean!
    savedCount: Int!
    message: String!
  }

  input VocabularyInput {
    text: String!
    definition: String!
    example: String
    exampleTrans: String
    realLifeDef: String
    surroundingText: String
    videoTitle: String
  }

  input CardUpdateInput {
    vocabularyId: ID!
    difficulty: Float
    stability: Float
    dueDate: String
    state: Int
    lastReview: String
    reps: Int
  }

  type Query {
    ping: String!
    me: User

    sessions: [Session!]!
    session(id: ID!): Session
    getSessionResume(sessionId: ID!): NetworkingSessionResume
    getSessionEvaluation(sessionId: ID!): SessionEvaluation
  }

  type Mutation {
    startNetworkingSession(input: StartNetworkingSessionInput!): Session!
    renameSession(input: RenameSessionInput!): Session!
    deleteSession(sessionId: ID!): DeleteSessionPayload!
    requestStageTransition(input: RequestStageTransitionInput!): StageTransitionPayload!
    appendSessionTurn(input: AppendSessionTurnInput!): SessionTurn!
    finalizeNetworkingSession(sessionId: ID!): FinalizeNetworkingSessionPayload!
    generateFollowupEmail(input: GenerateFollowupEmailInput!): FollowupEmailSuggestion!

    saveVocabulary(input: VocabularyInput!): VocabularyEntry!
    startReviewSession: [VocabularyEntry!]!
    saveReviewSession(updates: [CardUpdateInput!]!): SaveReviewSessionPayload!
  }
`;
