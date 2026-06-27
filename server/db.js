'use strict';

// Single shared Postgres connection pool.
// Configured entirely via DATABASE_URL (see server/.env / server/.env.example).
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    '[orbit] DATABASE_URL is not set. Copy server/.env.example to server/.env ' +
    'and fill in your Postgres connection string.'
  );
  process.exit(1);
}

const pool = new Pool({ connectionString });

pool.on('error', (err) => {
  // Don't crash the process on an idle-client error — just log it.
  console.error('[orbit] unexpected idle Postgres client error:', err.message);
});

// Create the scores table if it doesn't exist yet, so a fresh database
// just works on first boot.
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(24) NOT NULL,
      rounds     INTEGER NOT NULL CHECK (rounds >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS scores_rounds_idx
      ON scores (rounds DESC, created_at ASC);
  `);
}

module.exports = { pool, ensureSchema };
