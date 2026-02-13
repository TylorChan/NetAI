import { CREATE_SCHEMA_SQL } from "./schema.js";

export async function initializeDatabase({ pool, logger }) {
  await pool.query(CREATE_SCHEMA_SQL);
  logger?.info("database schema initialized");
}
