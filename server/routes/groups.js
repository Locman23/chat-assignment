const express = require('express');
const router = express.Router();
const { getCollections, makeGid, makeCid, normalize } = require('../db/mongo');

/*
Group & channel management:
Data shape: { id, name, ownerUsername, admins[], members[], channels[{id,name}] }
Roles (coarse): Super Admin (global), Group Admin (global role elevating user), owner (per-group implicit admin).
Authorization checks are repeated inline for clarity given small surface area.
Case-insensitive identity comparisons use normalize() to prevent duplicate logical entries.
Future hardening:
 - Extract repeated auth logic into middleware.
 - Add Mongo indexes for uniqueness (e.g., group id, channel ids) & channel name per group if scaling.
*/

async function getUserByUsername(username) {
  const { users } = getCollections();
  if (!username) return null;
  return users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
}

async function hasUser(username) { return !!(await getUserByUsername(username)); }
async function getGroupById(gid) {
  const { groups } = getCollections();
  return groups.findOne({ id: gid });
}
async function attachGroupToUser(username, gid) {
  const { users } = getCollections();
  await users.updateOne({ username }, { $addToSet: { groups: gid } });
}

// GET /api/groups
router.get('/', async (_req, res) => { // list all groups (no pagination yet)
  const { groups } = getCollections();
  const list = await groups.find({}).project({ _id: 0 }).toArray();
  res.json({ groups: list });
});

// POST /api/groups
router.post('/', async (req, res) => { // create new group (owner must be Group Admin or Super Admin)
  const { name, ownerUsername } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'group name required' });
  if (!ownerUsername?.trim()) return res.status(400).json({ error: 'ownerUsername required' });
  if (!(await hasUser(ownerUsername))) return res.status(404).json({ error: 'owner user not found' });
  const owner = await getUserByUsername(ownerUsername);
  const canCreate = owner.roles.includes('Group Admin') || owner.roles.includes('Super Admin');
  if (!canCreate) return res.status(403).json({ error: 'only Group Admins or Super Admins can create groups' });
  const { groups } = getCollections();
  const group = { id: makeGid(), name: name.trim(), ownerUsername: ownerUsername.trim(), admins: [ownerUsername.trim()], members: [ownerUsername.trim()], channels: [] };
  await groups.insertOne(group);
  await attachGroupToUser(ownerUsername, group.id);
  return res.status(201).json({ group });
});

// GET /api/groups/:gid
router.get('/:gid', async (req, res) => { // fetch single group summary
  const g = await getGroupById(req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  return res.json({ id: g.id, name: g.name, ownerUsername: g.ownerUsername, members: g.members, channels: g.channels });
});

// DELETE /api/groups/:gid
router.delete('/:gid', async (req, res) => { // delete whole group (owner or Super Admin)
  const { gid } = req.params;
  const { requester } = req.body || {};
  const { groups, users } = getCollections();
  const g = await groups.findOne({ id: gid });
  if (!g) return res.status(404).json({ error: 'group not found' });
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isOwner) return res.status(403).json({ error: 'not authorized to delete group' });
  await groups.deleteOne({ id: gid });
  await users.updateMany({}, { $pull: { groups: gid } });
  res.json({ success: true });
});

// POST /api/groups/:gid/members
router.post('/:gid/members', async (req, res) => { // add member (Super / owner / group admin)
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });
  const { groups } = getCollections();
  const g = await groups.findOne({ id: gid });
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!(await hasUser(username))) return res.status(404).json({ error: 'user not found' });
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  const isGroupAdmin = (g.admins || []).some(a => normalize(a) === normalize(requester));
  if (!isSuper && !isGroupOwner && !isGroupAdmin) return res.status(403).json({ error: 'not authorized to add members' });
  const already = (g.members || []).some(m => normalize(m) === normalize(username));
  if (!already) {
    await groups.updateOne({ id: gid }, { $addToSet: { members: username.trim() } });
    await attachGroupToUser(username, g.id);
  }
  const updated = await groups.findOne({ id: gid }, { projection: { _id: 0, members: 1 } });
  return res.status(201).json({ members: updated.members });
});

// DELETE /api/groups/:gid/members
router.delete('/:gid/members', async (req, res) => { // remove member (Super / owner / group admin)
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });
  const { groups, users } = getCollections();
  const g = await groups.findOne({ id: gid });
  if (!g) return res.status(404).json({ error: 'group not found' });
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  const isGroupAdmin = (g.admins || []).some(a => normalize(a) === normalize(requester));
  if (!isSuper && !isGroupOwner && !isGroupAdmin) return res.status(403).json({ error: 'not authorized to remove members' });
  await groups.updateOne({ id: gid }, { $pull: { members: username } });
  await users.updateOne({ username }, { $pull: { groups: gid } });
  const updated = await groups.findOne({ id: gid }, { projection: { _id: 0, members: 1 } });
  return res.json({ members: updated.members || [] });
});

// POST /api/groups/:gid/channels
router.post('/:gid/channels', async (req, res) => { // create channel inside group (Super / owner / group admin)
  const { name, requester } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'channel name required' });
  const { groups } = getCollections();
  const g = await groups.findOne({ id: req.params.gid });
  if (!g) return res.status(404).json({ error: 'group not found' });
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  const isGroupAdmin = (g.admins || []).some(a => normalize(a) === normalize(requester));
  if (!isSuper && !isGroupOwner && !isGroupAdmin) return res.status(403).json({ error: 'not authorized to create channels' });
  const taken = (g.channels || []).some(c => c.name.toLowerCase() === name.toLowerCase());
  if (taken) return res.status(409).json({ error: 'channel name taken in this group' });
  const channel = { id: makeCid(), name: name.trim() };
  await groups.updateOne({ id: g.id }, { $push: { channels: channel } });
  res.status(201).json({ channel });
});

// GET /api/groups/:gid/channels
router.get('/:gid/channels', async (req, res) => { // list channels in a group
  const g = await getGroupById(req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  return res.json({ channels: g.channels || [] });
});

// POST /api/groups/:gid/admins
router.post('/:gid/admins', async (req, res) => { // add group admin (requires Super Admin OR group owner)
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });
  const { groups } = getCollections();
  const g = await groups.findOne({ id: gid });
  if (!g) return res.status(404).json({ error: 'group not found' });
  const target = await getUserByUsername(username);
  if (!target) return res.status(404).json({ error: 'user not found' });
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isGroupOwner) return res.status(403).json({ error: 'not authorized to add admins to this group' });
  if (!target.roles.includes('Group Admin') && !target.roles.includes('Super Admin')) return res.status(400).json({ error: 'user must be a Group Admin (promoted by Super Admin) before adding as group admin' });
  if (!(g.admins || []).some(a => normalize(a) === normalize(username))) {
    await groups.updateOne({ id: gid }, { $addToSet: { admins: username.trim() } });
  }
  const updated = await groups.findOne({ id: gid }, { projection: { _id: 0, admins: 1 } });
  return res.status(201).json({ admins: updated.admins || [] });
});

// DELETE /api/groups/:gid/admins
router.delete('/:gid/admins', async (req, res) => { // remove group admin (Super Admin or owner; cannot remove owner)
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });
  const { groups } = getCollections();
  const g = await groups.findOne({ id: gid });
  if (!g) return res.status(404).json({ error: 'group not found' });
  const target = await getUserByUsername(username);
  if (!target) return res.status(404).json({ error: 'user not found' });
  if (normalize(username) === normalize(g.ownerUsername)) return res.status(400).json({ error: 'cannot remove group owner from admins' });
  const reqUser = await getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isGroupOwner) return res.status(403).json({ error: 'not authorized to remove admins from this group' });
  const isAdmin = (g.admins || []).some(a => normalize(a) === normalize(username));
  if (!isAdmin) return res.status(404).json({ error: 'user is not an admin of this group' });
  await groups.updateOne({ id: gid }, { $pull: { admins: username } });
  const updated = await groups.findOne({ id: gid }, { projection: { _id: 0, admins: 1 } });
  return res.json({ admins: updated.admins || [] });
});

module.exports = router;
