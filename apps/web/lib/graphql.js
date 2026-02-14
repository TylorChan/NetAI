import { API_BASE_URL } from "./config";

export async function graphqlRequest(query, variables = {}) {
  const response = await fetch(`${API_BASE_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables }),
    credentials: "include",
    cache: "no-store"
  });

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  return payload.data;
}

export const mutations = {
  startNetworkingSession: `
    mutation StartNetworkingSession($input: StartNetworkingSessionInput!) {
      startNetworkingSession(input: $input) {
        id
        userId
        goal
        displayTitle
        goalSummary
        status
        targetProfileContext
        customContext
        createdAt
      }
    }
  `,
  renameSession: `
    mutation RenameSession($input: RenameSessionInput!) {
      renameSession(input: $input) {
        id
        goal
        displayTitle
        goalSummary
        updatedAt
      }
    }
  `,
  deleteSession: `
    mutation DeleteSession($sessionId: ID!) {
      deleteSession(sessionId: $sessionId) {
        sessionId
        deleted
      }
    }
  `,
  requestStageTransition: `
    mutation RequestStageTransition($input: RequestStageTransitionInput!) {
      requestStageTransition(input: $input) {
        applied
        reason
        session {
          id
          stageState
          updatedAt
        }
      }
    }
  `,
  appendSessionTurn: `
    mutation AppendSessionTurn($input: AppendSessionTurnInput!) {
      appendSessionTurn(input: $input) {
        id
        role
        content
        createdAt
        sessionId
      }
    }
  `,
  finalizeNetworkingSession: `
    mutation FinalizeNetworkingSession($sessionId: ID!) {
      finalizeNetworkingSession(sessionId: $sessionId) {
        queued
        message
        session {
          id
          status
          endedAt
          updatedAt
        }
      }
    }
  `,
  generateFollowupEmail: `
    mutation GenerateFollowupEmail($input: GenerateFollowupEmailInput!) {
      generateFollowupEmail(input: $input) {
        subject
        body
      }
    }
  `
};

export const queries = {
  me: `
    query Me {
      me {
        id
        email
        name
        createdAt
      }
    }
  `,
  getSessionResume: `
    query GetSessionResume($sessionId: ID!) {
      getSessionResume(sessionId: $sessionId) {
        contextSummary
        conversationSummary
        talkNudges
        stageHint
        session {
          id
          userId
          goal
          displayTitle
          goalSummary
          status
          stageState
          targetProfileContext
          customContext
          createdAt
          updatedAt
          endedAt
          talkNudges
        }
        recentTurns {
          id
          role
          content
          createdAt
          sessionId
        }
      }
    }
  `,
  getSessionEvaluation: `
    query GetSessionEvaluation($sessionId: ID!) {
      getSessionEvaluation(sessionId: $sessionId) {
        sessionId
        score
        strengths
        improvements
        nextActions
        followUpEmail
        createdAt
      }
    }
  `,
  sessions: `
    query Sessions {
      sessions {
        id
        goal
        displayTitle
        status
        stageState
        updatedAt
      }
    }
  `
};
