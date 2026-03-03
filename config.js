'use strict';

const path   = require('path');
const fs     = require('fs');
const dotenv = require('dotenv');

// Load .env if present (dev). In production, vars come from the environment directly.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD:  isProd,

  // ── Paths ──────────────────────────────────────────────────────────────────
  // Production: set these as real env vars pointing outside the repo
  // Dev:        .env points them to local folders (all gitignored)
  USERS_FILE:  process.env.USERS_FILE
    ? path.resolve(process.env.USERS_FILE)
    : path.join(__dirname, 'dev-data', 'users.json'),

  UPLOADS_DIR: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, 'uploads'),

  DATA_DIR: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, 'data'),

  get FILES_DB()  { return path.join(this.DATA_DIR, 'files.json');  },
  get GROUPS_DB() { return path.join(this.DATA_DIR, 'groups.json'); },

  // ── Session ────────────────────────────────────────────────────────────────
  SESSION_SECRET:     process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000,

  // ── Server ─────────────────────────────────────────────────────────────────
  PORT: parseInt(process.env.PORT || '3000', 10),

  // ── Rate limiting ──────────────────────────────────────────────────────────
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MS:    15 * 60 * 1000,
};
