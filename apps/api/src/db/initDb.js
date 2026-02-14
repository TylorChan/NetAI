import { CREATE_SCHEMA_SQL } from "./schema.js";

export async function initializeDatabase({ pool, logger }) {
  await pool.query(CREATE_SCHEMA_SQL);

  // Backfill stage tracking columns for existing sessions so new policies
  // don't treat "stage age" as days old and auto-advance immediately.
  await pool.query(
    `
    UPDATE sessions
    SET stage_entered_at = NOW()
    WHERE stage_entered_at IS NULL
    `
  );

  logger?.info("database schema initialized");
}
