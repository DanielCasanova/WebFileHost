'use strict';

const express  = require('express');
const bcrypt   = require('bcrypt');
const { nanoid } = require('nanoid');
const { requireAuth } = require('../middleware/auth');
const { readFiles, readGroups, writeGroups } = require('./db');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/groups ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const groups = readGroups().filter(g => g.owner === req.session.username);
  res.json(groups.map(({ id, codename, fileIds, expiresAt, downloadLimit, downloadCount, createdAt }) =>
    ({ id, codename, fileIds, expiresAt, downloadLimit, downloadCount, createdAt })
  ));
});

// ── POST /api/groups ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { codename, password, fileIds = [], expiresAt = null, downloadLimit = null } = req.body;

  if (!password || password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const resolvedCodename = (codename || '').trim() || nanoid(8);

  const existing = readGroups().find(g => g.codename === resolvedCodename);
  if (existing) return res.status(409).json({ error: 'Codename already taken' });

  const myFiles  = readFiles().filter(f => f.owner === req.session.username).map(f => f.id);
  const validIds = fileIds.filter(id => myFiles.includes(id));

  const group = {
    id:            nanoid(),
    owner:         req.session.username,
    codename:      resolvedCodename,
    passwordHash:  await bcrypt.hash(password, 12),
    fileIds:       validIds,
    expiresAt:     expiresAt || null,
    downloadLimit: downloadLimit ? parseInt(downloadLimit) : null,
    downloadCount: 0,
    createdAt:     new Date().toISOString(),
  };

  const groups = readGroups();
  groups.push(group);
  writeGroups(groups);

  res.status(201).json({ id: group.id, codename: group.codename });
});

// ── PATCH /api/groups/:id ─────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const groups = readGroups();
  const group  = groups.find(g => g.id === req.params.id && g.owner === req.session.username);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const { password, fileIds, expiresAt, downloadLimit, codename } = req.body;

  if (codename !== undefined) {
    const trimmed  = codename.trim();
    const conflict = groups.find(g => g.codename === trimmed && g.id !== group.id);
    if (conflict) return res.status(409).json({ error: 'Codename already taken' });
    group.codename = trimmed;
  }

  if (password)              group.passwordHash  = await bcrypt.hash(password, 12);
  if (fileIds !== undefined) {
    const myFiles  = readFiles().filter(f => f.owner === req.session.username).map(f => f.id);
    group.fileIds  = fileIds.filter(id => myFiles.includes(id));
  }
  if (expiresAt     !== undefined) group.expiresAt     = expiresAt     || null;
  if (downloadLimit !== undefined) group.downloadLimit = downloadLimit ? parseInt(downloadLimit) : null;

  writeGroups(groups);
  res.json({ ok: true });
});

// ── DELETE /api/groups/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const groups = readGroups();
  const idx    = groups.findIndex(g => g.id === req.params.id && g.owner === req.session.username);
  if (idx === -1) return res.status(404).json({ error: 'Group not found' });

  groups.splice(idx, 1);
  writeGroups(groups);
  res.json({ ok: true });
});

module.exports = router;
