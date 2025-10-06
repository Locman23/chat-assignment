const express = require('express');
const router = express.Router();
const { getCollections, makeRid, normalize } = require('../db/mongo');

async function getUserByUsername(username) {
  const { users } = getCollections();
  if (!username) return null;
  return users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
}
async function hasUser(username) { return !!(await getUserByUsername(username)); }
async function getGroupById(gid) { const { groups } = getCollections(); return groups.findOne({ id: gid }); }
async function attachGroupToUser(username, gid) { const { users } = getCollections(); await users.updateOne({ username }, { $addToSet: { groups: gid } }); }

// POST /api/groups/:gid/requests
router.post('/groups/:gid/requests', async (req, res) => {
  const { gid } = req.params;
  const { username } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });
  const { joinRequests } = getCollections();
  const g = await getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!(await hasUser(username))) return res.status(404).json({ error: 'user not found' });
  if ((g.members || []).some(m => normalize(m) === normalize(username))) return res.status(400).json({ error: 'user already a member' });
  const exists = await joinRequests.findOne({ gid, username, status: 'pending' });
  if (exists) return res.status(409).json({ error: 'request already pending' });
  const reqObj = { id: makeRid(), gid, username: username.trim(), status: 'pending', createdAt: Date.now() };
  await joinRequests.insertOne(reqObj);
  return res.status(201).json({ request: reqObj });
});

// GET /api/requests
router.get('/requests', async (req, res) => {
  const { requester } = req.query || {};
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can list requests' });
  const { joinRequests } = getCollections();
  const pending = await joinRequests.find({ status: 'pending' }).project({ _id: 0 }).toArray();
  return res.json({ requests: pending });
});

// PUT /api/requests/:rid/approve
router.put('/requests/:rid/approve', async (req, res) => {
  const { rid } = req.params;
  const { requester } = req.body || {};
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can approve requests' });
  const { joinRequests, groups } = getCollections();
  const r = await joinRequests.findOne({ id: rid });
  if (!r) return res.status(404).json({ error: 'request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'request already processed' });
  const g = await groups.findOne({ id: r.gid });
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!(g.members || []).some(m => normalize(m) === normalize(r.username))) {
    await groups.updateOne({ id: g.id }, { $addToSet: { members: r.username } });
    await attachGroupToUser(r.username, g.id);
  }
  await joinRequests.updateOne({ id: rid }, { $set: { status: 'approved', processedBy: requester, processedAt: Date.now() } });
  const updatedGroup = await groups.findOne({ id: g.id }, { projection: { _id: 0, members: 1 } });
  const updatedReq = await joinRequests.findOne({ id: rid }, { projection: { _id: 0 } });
  return res.json({ request: updatedReq, members: updatedGroup.members });
});

// PUT /api/requests/:rid/deny
router.put('/requests/:rid/deny', async (req, res) => {
  const { rid } = req.params;
  const { requester } = req.body || {};
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can deny requests' });
  const { joinRequests } = getCollections();
  const r = await joinRequests.findOne({ id: rid });
  if (!r) return res.status(404).json({ error: 'request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'request already processed' });
  await joinRequests.updateOne({ id: rid }, { $set: { status: 'denied', processedBy: requester, processedAt: Date.now() } });
  const updatedReq = await joinRequests.findOne({ id: rid }, { projection: { _id: 0 } });
  return res.json({ request: updatedReq });
});

module.exports = router;
