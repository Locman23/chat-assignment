const express = require('express');
const router = express.Router();
const { canAccessGroup } = require('../utils/access');
const asyncHandler = require('../utils/asyncHandler');

// GET history with optional limit & beforeTs; uses limit+1 to compute hasMore.
router.get('/:groupId/:channelId', asyncHandler(async (req, res) => {
  const { groupId, channelId } = req.params;
  const { user: username, limit, beforeTs } = req.query || {};
  if (!username) return res.status(400).json({ error: 'user query param required' });
  if (!(await canAccessGroup(username, groupId))) return res.status(403).json({ error: 'not authorized' });
  const { MAX_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT } = require('../constants');
  const limRequested = Math.min(MAX_HISTORY_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT));
  const effectiveBefore = beforeTs ? Number(beforeTs) : undefined;
  const { getDb } = require('../db/mongo');
  const messagesCol = getDb().collection('messages');
  const q = { groupId, channelId };
  if (effectiveBefore) q.ts = { $lt: effectiveBefore };
  const docs = await messagesCol.find(q, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(limRequested + 1).toArray();
  const hasMore = docs.length > limRequested;
  const slice = hasMore ? docs.slice(0, limRequested) : docs;
  const messagesAsc = slice.slice().reverse();
  res.json({ messages: messagesAsc, hasMore });
}));

module.exports = router;
