'use strict';

const express  = require('express');
const bcrypt   = require('bcrypt');
const path     = require('path');
const fs       = require('fs');
const { nanoid } = require('nanoid');
const config   = require('../config');
const { readFiles, readGroups, writeGroups } = require('./db');

const router = express.Router();

// Short-lived in-memory download grants: token -> { groupId, expiresAt, counted }
const grants = new Map();

// ── POST /api/download/grant ──────────────────────────────────────────────────
router.post('/grant', async (req, res) => {
  const { codename, password } = req.body;

  if (!codename || !password)
    return res.status(400).json({ error: 'Codename and password required' });

  const groups = readGroups();
  const group  = groups.find(g => g.codename === codename.trim());

  // Always bcrypt-compare to avoid timing-based codename enumeration
  const hashToCheck = group
    ? group.passwordHash
    : '$2b$12$invalidhashfortimingpurposesonly00000000000000000000000';
  const match = await bcrypt.compare(password, hashToCheck);

  if (!group || !match)
    return res.status(401).json({ error: 'Invalid codename or password' });

  if (group.expiresAt && new Date() > new Date(group.expiresAt))
    return res.status(410).json({ error: 'This share has expired' });

  if (group.downloadLimit !== null && group.downloadCount >= group.downloadLimit)
    return res.status(410).json({ error: 'Download limit reached for this share' });

  // Issue a token valid for 30 minutes
  const token = nanoid(32);
  grants.set(token, {
    groupId:   group.id,
    expiresAt: Date.now() + 30 * 60 * 1000,
    counted:   false,
  });

  // Prune expired grants occasionally
  if (grants.size > 500) {
    for (const [k, v] of grants)
      if (Date.now() > v.expiresAt) grants.delete(k);
  }

  const allFiles = readFiles();
  const files    = group.fileIds
    .map(id => allFiles.find(f => f.id === id))
    .filter(Boolean)
    .map(({ id, originalName, size }) => ({ id, originalName, size }));

  res.json({ token, files });
});

// ── GET /api/download/file/:fileId?token=xxx ──────────────────────────────────
router.get('/file/:fileId', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(401).json({ error: 'Token required' });

  const grant = grants.get(token);
  if (!grant || Date.now() > grant.expiresAt) {
    grants.delete(token);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const groups = readGroups();
  const group  = groups.find(g => g.id === grant.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  if (!group.fileIds.includes(req.params.fileId))
    return res.status(403).json({ error: 'File not in this group' });

  const file = readFiles().find(f => f.id === req.params.fileId);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const diskPath = path.join(config.UPLOADS_DIR, file.storedName);
  if (!fs.existsSync(diskPath)) return res.status(404).json({ error: 'File missing on disk' });

  // Increment group download counter once per grant (not once per file)
  if (!grant.counted) {
    grant.counted = true;
    const idx = groups.findIndex(g => g.id === group.id);
    groups[idx].downloadCount = (groups[idx].downloadCount || 0) + 1;
    writeGroups(groups);
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(diskPath).pipe(res);
});

module.exports = router;
