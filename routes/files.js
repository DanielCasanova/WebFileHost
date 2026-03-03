'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { nanoid } = require('nanoid');
const config   = require('../config');
const { requireAuth } = require('../middleware/auth');
const { readFiles, writeFiles, readGroups, writeGroups } = require('./db');

const router = express.Router();
router.use(requireAuth);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.UPLOADS_DIR),
  filename:    (req, file, cb) => cb(null, nanoid() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ── GET /api/files ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const files = readFiles().filter(f => f.owner === req.session.username);
  res.json(files.map(({ id, originalName, size, uploadedAt }) =>
    ({ id, originalName, size, uploadedAt })
  ));
});

// ── POST /api/files ───────────────────────────────────────────────────────────
router.post('/', upload.array('files'), (req, res) => {
  const db    = readFiles();
  const added = [];

  for (const f of req.files) {
    const entry = {
      id:           nanoid(),
      owner:        req.session.username,
      originalName: f.originalname,
      storedName:   f.filename,
      size:         f.size,
      uploadedAt:   new Date().toISOString(),
    };
    db.push(entry);
    added.push({ id: entry.id, originalName: entry.originalName, size: entry.size });
  }

  writeFiles(db);
  res.status(201).json(added);
});

// ── DELETE /api/files/:id ─────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const db  = readFiles();
  const idx = db.findIndex(f => f.id === req.params.id && f.owner === req.session.username);
  if (idx === -1) return res.status(404).json({ error: 'File not found' });

  const [file] = db.splice(idx, 1);
  writeFiles(db);

  // Unlink from all groups owned by this user
  const groups = readGroups();
  groups.forEach(g => {
    if (g.owner === req.session.username)
      g.fileIds = g.fileIds.filter(id => id !== file.id);
  });
  writeGroups(groups);

  // Delete from disk
  const diskPath = path.join(config.UPLOADS_DIR, file.storedName);
  if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);

  res.json({ ok: true });
});

module.exports = router;
