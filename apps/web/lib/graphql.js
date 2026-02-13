import { API_BASE_URL } from "./config";

export async function graphqlRequest(query, variables = {}) {
  const response = await fetch(`${API_BASE_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables }),
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
        status
        targetProfileContext
        customContext
        createdAt
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
  getSessionResume: `
    query GetSessionResume($sessionId: ID!) {
      getSessionResume(sessionId: $sessionId) {
        contextSummary
        session {
          id
          userId
          goal
          status
          stageState
          targetProfileContext
          customContext
          createdAt
          updatedAt
          endedAt
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
  `
};
