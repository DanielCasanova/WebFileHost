'use strict';

const express   = require('express');
const bcrypt    = require('bcrypt');
const rateLimit = require('express-rate-limit');
const fs        = require('fs');
const config    = require('../config');

const router = express.Router();

// ── Rate limiter: 5 attempts per 15-min window per IP ─────────────────────────
const loginLimiter = rateLimit({
  windowMs: config.LOGIN_WINDOW_MS,
  max: config.LOGIN_MAX_ATTEMPTS,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many failed login attempts. Try again in 15 minutes.'
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(config.USERS_FILE, 'utf8'));
  } catch (e) {
    console.error('Could not read users file:', e.message);
    return [];
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const users = loadUsers();
  const user  = users.find(u => u.username === username.trim());

  if (!user) {
    // Constant-time-ish: still hash to avoid timing attacks
    await bcrypt.compare(password, '$2b$12$invalidhashfortimingpurposesonly00000000000');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.username = user.username;
    res.json({ ok: true });
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (req.session && req.session.username)
    return res.json({ username: req.session.username });
  res.status(401).json({ error: 'Not logged in' });
});

module.exports = router;
