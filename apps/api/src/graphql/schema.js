export const typeDefs = /* GraphQL */ `
  type Session {
    id: ID!
    userId: String!
    goal: String!
    status: String!
    targetProfileContext: String
    customContext: String
    stageState: String!
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

  input StartNetworkingSessionInput {
    userId: String!
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
    userId: String
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
    session(id: ID!): Session
    sessions(userId: String!): [Session!]!
    getSessionResume(sessionId: ID!): NetworkingSessionResume
    getSessionEvaluation(sessionId: ID!): SessionEvaluation
  }

  type Mutation {
    startNetworkingSession(input: StartNetworkingSessionInput!): Session!
    appendSessionTurn(input: AppendSessionTurnInput!): SessionTurn!
    finalizeNetworkingSession(sessionId: ID!): FinalizeNetworkingSessionPayload!
    generateFollowupEmail(input: GenerateFollowupEmailInput!): FollowupEmailSuggestion!

    saveVocabulary(input: VocabularyInput!): VocabularyEntry!
    startReviewSession(userId: String!): [VocabularyEntry!]!
    saveReviewSession(updates: [CardUpdateInput!]!): SaveReviewSessionPayload!
  }
`;
