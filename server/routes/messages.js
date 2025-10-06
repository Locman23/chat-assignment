const express = require('express');
const router = express.Router();
const { history } = require('../services/messageStore');
const { getCollections, normalize } = require('../db/mongo');

async function canAccess(username, groupId) {
  const { groups, users } = getCollections();
  const g = await groups.findOne({ id: groupId });
  if (!g) return false;
  const u = await users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
  if (!u) return false;
  if ((u.roles || []).includes('Super Admin')) return true;
  return (g.members || []).map(normalize).includes(normalize(username));
}

// GET /api/messages/:groupId/:channelId?limit=50&beforeTs=1234567890&user=alice
// Uses a limit+1 strategy for accurate hasMore detection.
router.get('/:groupId/:channelId', async (req, res) => {
  const { groupId, channelId } = req.params;
  const { user: username, limit, beforeTs } = req.query || {};
  if (!username) return res.status(400).json({ error: 'user query param required' });
  if (!(await canAccess(username, groupId))) return res.status(403).json({ error: 'not authorized' });
  try {
    const limRequested = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const effectiveBefore = beforeTs ? Number(beforeTs) : undefined;
    // Build custom query here to avoid double-fetching in service
    const { getDb } = require('../db/mongo');
    const messagesCol = getDb().collection('messages');
    const q = { groupId, channelId };
    if (effectiveBefore) q.ts = { $lt: effectiveBefore };
    // Fetch one extra to decide hasMore
    const docs = await messagesCol.find(q).sort({ ts: -1 }).limit(limRequested + 1).toArray();
    const hasMore = docs.length > limRequested;
    const slice = hasMore ? docs.slice(0, limRequested) : docs;
    // Reverse to chronological ascending
    const messagesAsc = slice.slice().reverse();
    res.json({ messages: messagesAsc, hasMore });
  } catch (e) {
    console.error('[messages] history error', e);
    res.status(500).json({ error: 'failed to load history' });
  }
});

module.exports = router;
