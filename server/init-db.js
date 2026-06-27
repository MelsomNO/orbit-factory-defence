'use strict';

// Standalone schema bootstrap: `npm run init-db`.
// The server also creates the schema automatically on boot, so this is only
// needed if you want to set up the database without starting the server.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { pool, ensureSchema } = require('./db');

ensureSchema()
  .then(() => {
    console.log('[orbit] schema ready.');
    return pool.end();
  })
  .catch((err) => {
    console.error('[orbit] schema init failed:', err.message);
    process.exit(1);
  });
