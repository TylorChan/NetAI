export const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  target_profile_context TEXT NOT NULL DEFAULT '',
  custom_context TEXT NOT NULL DEFAULT '',
  stage_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
  ON sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS session_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_session_created
  ON session_turns (session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS session_evaluations (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  strengths JSONB NOT NULL,
  improvements JSONB NOT NULL,
  next_actions JSONB NOT NULL,
  follow_up_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS vocabulary_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  definition TEXT NOT NULL,
  example TEXT NOT NULL DEFAULT '',
  example_trans TEXT NOT NULL DEFAULT '',
  real_life_def TEXT NOT NULL DEFAULT '',
  surrounding_text TEXT NOT NULL DEFAULT '',
  video_title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vocab_user_created
  ON vocabulary_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS vocabulary_fsrs_cards (
  vocabulary_id TEXT PRIMARY KEY REFERENCES vocabulary_entries(id) ON DELETE CASCADE,
  difficulty DOUBLE PRECISION NOT NULL,
  stability DOUBLE PRECISION NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  state INTEGER NOT NULL,
  last_review TIMESTAMPTZ NOT NULL,
  reps INTEGER NOT NULL
);
`;
