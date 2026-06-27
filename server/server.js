'use strict';

// Orbit scoreboard backend.
//   GET  /api/scores       → top scores (leaderboard)
//   POST /api/scores       → record a score { name, rounds }
//   GET  /api/health       → liveness probe
// Also serves the static game (index.html, js/, styles.css) from the repo root,
// so the whole thing runs from a single origin (no CORS needed).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const { pool, ensureSchema } = require('./db');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');     // repo root holds index.html
const MAX_NAME_LEN = 24;
const LEADERBOARD_LIMIT = 20;

const app = express();
app.use(express.json({ limit: '4kb' }));

// --- API ---------------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Top scores, highest rounds first; ties broken by who got there first.
app.get('/api/scores', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT name, rounds, created_at
         FROM scores
        ORDER BY rounds DESC, created_at ASC
        LIMIT $1`,
      [LEADERBOARD_LIMIT]
    );
    res.json({ scores: rows });
  } catch (err) {
    console.error('[orbit] GET /api/scores failed:', err.message);
    res.status(500).json({ error: 'Could not load scoreboard.' });
  }
});

// Record a new score. Trusts the client (no anti-cheat by design).
app.post('/api/scores', async (req, res) => {
  const body = req.body || {};

  let name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) name = 'Anonymous';
  if (name.length > MAX_NAME_LEN) name = name.slice(0, MAX_NAME_LEN);

  const rounds = Number(body.rounds);
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 1_000_000) {
    return res.status(400).json({ error: 'Invalid rounds value.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO scores (name, rounds)
       VALUES ($1, $2)
       RETURNING id, name, rounds, created_at`,
      [name, rounds]
    );
    const score = rows[0];

    // Figure out the leaderboard rank of this fresh entry.
    const { rows: rankRows } = await pool.query(
      `SELECT COUNT(*)::int + 1 AS rank
         FROM scores
        WHERE rounds > $1
           OR (rounds = $1 AND created_at < $2)`,
      [score.rounds, score.created_at]
    );

    res.status(201).json({ score, rank: rankRows[0].rank });
  } catch (err) {
    console.error('[orbit] POST /api/scores failed:', err.message);
    res.status(500).json({ error: 'Could not save score.' });
  }
});

// --- Static game -------------------------------------------------------

app.use(express.static(ROOT, { extensions: ['html'] }));

// --- Boot --------------------------------------------------------------

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[orbit] scoreboard server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[orbit] failed to initialise database schema:', err.message);
    process.exit(1);
  });
