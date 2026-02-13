# NetAI

NetAI is a web-first AI networking practice app with realtime voice coaching, session memory, post-session evaluation, and follow-up email generation.

## Implemented Architecture (current)

- `apps/web`: Next.js 16 + React 19 (JavaScript/JSX only)
- `apps/api`: Node.js GraphQL API (Express + GraphQL Yoga)
- `apps/worker`: Node.js evaluation worker (async scoring path)
- `infra/cloudrun`: Dockerfiles for Cloud Run deployment

## Core Product Flow

1. Create session with user goal + target profile context
2. Connect realtime voice session via ephemeral token endpoint
3. Persist turns at session level through GraphQL
4. Finalize session and queue async evaluation
5. Generate follow-up email draft

## Quick Start

Prerequisites:

- Node.js 24+
- npm 10+

Install dependencies:

```bash
npm install
```

Run services in separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

Open:

- Web: `http://localhost:3000`
- GraphQL API: `http://localhost:4000/graphql`
- API health: `http://localhost:4000/health`
- Worker health: `http://localhost:4100/health`

## Environment Variables

### API (`apps/api/.env`)

Use `apps/api/.env.example` as template.

Required for realtime token creation:

- `OPENAI_API_KEY`
- `PORT` (default `4000`)
- `OPENAI_REALTIME_MODEL` (default `gpt-realtime`)
- `WORKER_URL` (default `http://localhost:4100`)
- `CORS_ORIGIN` (default `http://localhost:3000`)

### Web (`apps/web/.env.local`)

Use `apps/web/.env.example` as template.

- `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`)
- `NEXT_PUBLIC_OPENAI_REALTIME_MODEL` (default `gpt-realtime`)

### Worker (`apps/worker/.env`)

Use `apps/worker/.env.example` as template.

- `OPENAI_API_KEY` (required)

## GraphQL Operations (implemented)

NetAI domain:

- `startNetworkingSession`
- `appendSessionTurn`
- `finalizeNetworkingSession`
- `getSessionResume`
- `getSessionEvaluation`
- `generateFollowupEmail`

MARKII-compatible business chain (reused semantics):

- `saveVocabulary`
- `startReviewSession`
- `saveReviewSession`

## Deployment Targets

- Web: Vercel
- API: Cloud Run
- Worker: Cloud Run
- Planned managed data layer: Cloud SQL + Memorystore

## What needs your intervention

1. Vercel project setup and environment variables
2. GCP project, billing, and Cloud Run/SQL/Redis APIs enabled
3. Production secrets in Secret Manager (`OPENAI_API_KEY`, etc.)
