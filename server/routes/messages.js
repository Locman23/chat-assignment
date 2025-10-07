const express = require('express');
const router = express.Router();
const { canAccessGroup } = require('../utils/access');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/messages/:groupId/:channelId?limit=50&beforeTs=1234567890&user=alice
// Uses a limit+1 strategy for accurate hasMore detection.
router.get('/:groupId/:channelId', asyncHandler(async (req, res) => {
  const { groupId, channelId } = req.params;
  const { user: username, limit, beforeTs } = req.query || {};
  if (!username) return res.status(400).json({ error: 'user query param required' });
  if (!(await canAccessGroup(username, groupId))) return res.status(403).json({ error: 'not authorized' });
  const limRequested = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
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
