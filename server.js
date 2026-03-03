'use strict';

const express = require('express');
const session = require('express-session');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');
const config  = require('./config');

// ── Ensure runtime directories exist ─────────────────────────────────────────
[config.DATA_DIR, config.UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Ensure JSON stores exist ──────────────────────────────────────────────────
[config.FILES_DB, config.GROUPS_DB].forEach(file => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', 'utf8');
});

// ── Dev: seed a default users.json if missing ─────────────────────────────────
if (!config.IS_PROD) {
  const devUsersDir = path.dirname(config.USERS_FILE);
  if (!fs.existsSync(devUsersDir)) fs.mkdirSync(devUsersDir, { recursive: true });

  if (!fs.existsSync(config.USERS_FILE)) {
    // Pre-computed bcrypt hash of "password" (rounds=12) — local dev only
    const defaultUsers = [
      {
        username:     'admin',
        passwordHash: '$2b$12$KIXtTCQMGiP7xbHpMaFO6OsGuFCUyVoJiMVuAH9DLWFH.FRbMvzYu'
      }
    ];
    fs.writeFileSync(config.USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    console.log('[dev] Created dev-data/users.json  ->  username: admin  /  password: password');
  }
}

const app = express();

// Trust the first proxy (Apache) — required when behind a reverse proxy
// so express-rate-limit can correctly identify clients by IP
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
    }
  }
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure:   config.IS_PROD,   // true in prod (HTTPS), false in dev (HTTP)
    sameSite: 'strict',
    maxAge:   config.SESSION_MAX_AGE_MS,
  }
}));

// ── Static files (HTML / CSS / JS) ───────────────────────────────────────────
// Uploads are NEVER in the static directory — they live in UPLOADS_DIR
app.use(express.static(path.join(__dirname, 'public')));

// ── Root redirect ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session && req.session.username) {
    return res.redirect('/dashboard.html');
  }
  res.redirect('/login.html');
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/files',    require('./routes/files'));
app.use('/api/groups',   require('./routes/groups'));
app.use('/api/download', require('./routes/download'));

// ── 404 for unknown API routes ────────────────────────────────────────────────
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ── Start ─────────────────────────────────────────────────────────────────────
// Prod: bind only to 127.0.0.1 so nginx is the only entry point
// Dev:  bind to 0.0.0.0 so localhost:3000 works directly in the browser
const host = config.IS_PROD ? '127.0.0.1' : '0.0.0.0';

app.listen(config.PORT, host, () => {
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`[${config.NODE_ENV}] WebFileHost -> http://${displayHost}:${config.PORT}`);
  if (!config.IS_PROD) {
    console.log(`[dev] uploads -> ${config.UPLOADS_DIR}`);
    console.log(`[dev] data    -> ${config.DATA_DIR}`);
    console.log(`[dev] users   -> ${config.USERS_FILE}`);
  }
});
