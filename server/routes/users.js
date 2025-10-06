const express = require('express');
const router = express.Router();
const { getCollections, makeId, normalize } = require('../db/mongo');

// GET /api/users
router.get('/', async (_req, res) => {
  const { users } = getCollections();
  const list = await users.find({}).project({ _id: 0 }).toArray();
  res.json({ users: list });
});

// POST /api/users
router.post('/', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !username.trim()) return res.status(400).json({ error: 'username required' });
  const { users } = getCollections();
  const exists = await users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
  if (exists) return res.status(409).json({ error: 'username taken' });
  const user = { id: makeId('u'), username: username.trim(), email: (email || '').trim(), password: password || '', roles: ['User'], groups: [] };
  await users.insertOne(user);
  return res.status(201).json({ user });
});

// PUT /api/users/:id/role
router.put('/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role, requester } = req.body || {};
  if (!role || !role.trim()) return res.status(400).json({ error: 'role required' });
  const { users, groups } = getCollections();
  const user = await users.findOne({ id });
  if (!user) return res.status(404).json({ error: 'user not found' });
  const validRoles = ['Super Admin', 'Group Admin', 'User'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'invalid role' });
  const reqUser = await users.findOne({ username: requester });
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if ((role === 'Group Admin' || role === 'Super Admin') && !isSuper) return res.status(403).json({ error: 'only Super Admin can assign that role' });
  if (!isSuper && role !== 'User') return res.status(403).json({ error: 'not authorized to change role' });
  const prevRoles = Array.isArray(user.roles) ? [...user.roles] : [];
  await users.updateOne({ id }, { $set: { roles: [role] } });
  if (prevRoles.includes('Group Admin') && role !== 'Group Admin') {
    const uname = user.username;
    await groups.updateMany({ admins: { $in: [uname] } }, { $pull: { admins: uname } });
  }
  const updated = await users.findOne({ id }, { projection: { _id: 0 } });
  return res.json({ user: updated });
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { username, email, password, requester } = req.body || {};
  const { users } = getCollections();
  const user = await users.findOne({ id });
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (normalize(user.username) === 'super') return res.status(403).json({ error: 'not allowed' });
  const reqUser = await users.findOne({ username: requester });
  if (!reqUser) return res.status(403).json({ error: 'requester not found' });
  if (reqUser.id !== id) return res.status(403).json({ error: 'not authorized to update this profile' });
  const update = {};
  if (username && normalize(username) !== normalize(user.username)) {
    const exists = await users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
    if (exists) return res.status(409).json({ error: 'username taken' });
    update.username = username.trim();
  }
  if (email !== undefined) update.email = (email || '').trim();
  if (password !== undefined && String(password).trim() !== '') update.password = password;
  if (Object.keys(update).length === 0) return res.json({ user });
  await users.updateOne({ id }, { $set: update });
  const updated = await users.findOne({ id }, { projection: { _id: 0 } });
  return res.json({ user: updated });
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { requester } = req.body || {};
  const { users, groups } = getCollections();
  const toDelete = await users.findOne({ id });
  if (!toDelete) return res.status(404).json({ error: 'user not found' });
  const reqUser = await users.findOne({ username: requester });
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isSelf = reqUser && reqUser.id === id;
  if (!isSuper && !isSelf) return res.status(403).json({ error: 'not authorized to delete this user' });
  await users.deleteOne({ id });
  await groups.updateMany({}, { $pull: { members: toDelete.username, admins: toDelete.username } });
  return res.json({ success: true });
});

module.exports = router;
