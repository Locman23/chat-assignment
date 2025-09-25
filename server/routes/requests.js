const express = require('express');
const router = express.Router();
const {
  db,
  makeRid,
  normalize,
  hasUser,
  getUserByUsername,
  getGroupById,
  attachGroupToUser,
  saveData
} = require('../dataStore');

// POST /api/groups/:gid/requests
router.post('/groups/:gid/requests', (req, res) => {
  const { gid } = req.params;
  const { username } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!hasUser(username)) return res.status(404).json({ error: 'user not found' });

  if (g.members.some(m => normalize(m) === normalize(username))) {
    return res.status(400).json({ error: 'user already a member' });
  }

  const exists = db.joinRequests.some(r => r.gid === gid && normalize(r.username) === normalize(username) && r.status === 'pending');
  if (exists) return res.status(409).json({ error: 'request already pending' });

  const reqObj = { id: makeRid(), gid, username: username.trim(), status: 'pending', createdAt: Date.now() };
  db.joinRequests.push(reqObj);
  saveData();
  return res.status(201).json({ request: reqObj });
});

// GET /api/requests
router.get('/requests', (req, res) => {
  const { requester } = req.query || {};
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can list requests' });

  const pending = db.joinRequests.filter(r => r.status === 'pending');
  return res.json({ requests: pending });
});

// PUT /api/requests/:rid/approve
router.put('/requests/:rid/approve', (req, res) => {
  const { rid } = req.params;
  const { requester } = req.body || {};
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can approve requests' });

  const r = db.joinRequests.find(x => x.id === rid);
  if (!r) return res.status(404).json({ error: 'request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'request already processed' });

  const g = getGroupById(r.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });

  if (!g.members.some(m => normalize(m) === normalize(r.username))) {
    g.members.push(r.username);
    attachGroupToUser(r.username, g.id);
  }

  r.status = 'approved';
  r.processedBy = requester;
  r.processedAt = Date.now();
  saveData();
  return res.json({ request: r, members: g.members });
});

// PUT /api/requests/:rid/deny
router.put('/requests/:rid/deny', (req, res) => {
  const { rid } = req.params;
  const { requester } = req.body || {};
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can deny requests' });

  const r = db.joinRequests.find(x => x.id === rid);
  if (!r) return res.status(404).json({ error: 'request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'request already processed' });

  r.status = 'denied';
  r.processedBy = requester;
  r.processedAt = Date.now();
  saveData();
  return res.json({ request: r });
});

module.exports = router;
