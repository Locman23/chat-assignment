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

// GET /api/messages/:groupId/:channelId?limit=50&user=alice
router.get('/:groupId/:channelId', async (req, res) => {
  const { groupId, channelId } = req.params;
  const { user: username, limit } = req.query || {};
  if (!username) return res.status(400).json({ error: 'user query param required' });
  if (!(await canAccess(username, groupId))) return res.status(403).json({ error: 'not authorized' });
  try {
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const list = await history(groupId, channelId, { limit: lim });
    res.json({ messages: list });
  } catch (e) {
    console.error('[messages] history error', e);
    res.status(500).json({ error: 'failed to load history' });
  }
});

module.exports = router;
