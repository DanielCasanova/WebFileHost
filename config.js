'use strict';

const path   = require('path');
const fs     = require('fs');
const dotenv = require('dotenv');

// Load .env only in dev
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD:  isProd,

  // ── Paths — hardcoded per environment ─────────────────────────────────────
  USERS_FILE:  isProd
    ? '/etc/fileshare/users.json'
    : path.join(__dirname, 'test', 'users.json'),

  UPLOADS_DIR: isProd
    ? '/var/fileshare/uploads'
    : path.join(__dirname, 'uploads'),

  DATA_DIR: isProd
    ? '/var/fileshare/data'
    : path.join(__dirname, 'data'),

  get FILES_DB()  { return path.join(this.DATA_DIR, 'files.json');  },
  get GROUPS_DB() { return path.join(this.DATA_DIR, 'groups.json'); },

  // ── The only thing that must stay outside the repo ─────────────────────────
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-in-production',

  // ── Session ────────────────────────────────────────────────────────────────
  SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000,

  // ── Server ─────────────────────────────────────────────────────────────────
  PORT: parseInt(process.env.PORT || '3001', 10),

  // ── Rate limiting ──────────────────────────────────────────────────────────
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MS:    15 * 60 * 1000,
};
