const express = require('express');
const router = express.Router();
const {
  db,
  makeGid,
  makeCid,
  normalize,
  hasUser,
  getUserByUsername,
  getGroupById,
  attachGroupToUser,
  saveData
} = require('../dataStore');

// GET /api/groups
router.get('/', (req, res) => res.json({ groups: db.groups }));

// POST /api/groups
router.post('/', (req, res) => {
  const { name, ownerUsername } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'group name required' });
  if (!ownerUsername?.trim()) return res.status(400).json({ error: 'ownerUsername required' });
  if (!hasUser(ownerUsername)) return res.status(404).json({ error: 'owner user not found' });

  const owner = getUserByUsername(ownerUsername);
  if (!owner) return res.status(404).json({ error: 'owner not found' });
  const canCreate = owner.roles.includes('Group Admin') || owner.roles.includes('Super Admin');
  if (!canCreate) return res.status(403).json({ error: 'only Group Admins or Super Admins can create groups' });

  const group = {
    id: makeGid(),
    name: name.trim(),
    ownerUsername: ownerUsername.trim(),
    admins: [ownerUsername.trim()],
    members: [ownerUsername.trim()],
    channels: []
  };

  db.groups.push(group);
  attachGroupToUser(ownerUsername, group.id);

  saveData();
  return res.status(201).json({ group });
});

// GET /api/groups/:gid
router.get('/:gid', (req, res) => {
  const g = getGroupById(req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  return res.json({ id: g.id, name: g.name, ownerUsername: g.ownerUsername, members: g.members, channels: g.channels });
});

// DELETE /api/groups/:gid
router.delete('/:gid', (req, res) => {
  const { gid } = req.params;
  const { requester } = req.body || {};
  const idx = db.groups.findIndex(g => g.id === gid);
  if (idx === -1) return res.status(404).json({ error: 'group not found' });
  const g = db.groups[idx];

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isOwner) return res.status(403).json({ error: 'not authorized to delete group' });

  db.groups.splice(idx, 1);
  db.users.forEach(u => {
    u.groups = u.groups.filter(gidVal => gidVal !== gid);
  });
  saveData();
  res.json({ success: true });
});

// POST /api/groups/:gid/members
router.post('/:gid/members', (req, res) => {
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!hasUser(username)) return res.status(404).json({ error: 'user not found' });

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  const isGroupAdmin = g.admins && g.admins.some(a => normalize(a) === normalize(requester));
  if (!isSuper && !isGroupOwner && !isGroupAdmin) return res.status(403).json({ error: 'not authorized to add members' });

  const already = g.members.some((m) => normalize(m) === normalize(username));
  if (!already) {
    g.members.push(username.trim());
    attachGroupToUser(username, g.id);
  }
  saveData();
  return res.status(201).json({ members: g.members });
});

// DELETE /api/groups/:gid/members
router.delete('/:gid/members', (req, res) => {
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  const isGroupAdmin = g.admins && g.admins.some(a => normalize(a) === normalize(requester));
  if (!isSuper && !isGroupOwner && !isGroupAdmin) return res.status(403).json({ error: 'not authorized to remove members' });

  g.members = g.members.filter(m => normalize(m) !== normalize(username));
  const u = getUserByUsername(username);
  if (u) u.groups = u.groups.filter(gidVal => gidVal !== gid);
  saveData();
  return res.json({ members: g.members });
});

// POST /api/groups/:gid/channels
router.post('/:gid/channels', (req, res) => {
  const g = db.groups.find(x => x.id === req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });

  const { name, requester } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'channel name required' });

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  const isGroupAdmin = g.admins && g.admins.some(a => normalize(a) === normalize(requester));
  if (!isSuper && !isGroupOwner && !isGroupAdmin) return res.status(403).json({ error: 'not authorized to create channels' });

  const taken = g.channels.some(c => c.name.toLowerCase() === name.toLowerCase());
  if (taken) return res.status(409).json({ error: 'channel name taken in this group' });

  const channel = { id: makeCid(), name: name.trim() };
  g.channels.push(channel);
  saveData();
  res.status(201).json({ channel });
});

// GET /api/groups/:gid/channels
router.get('/:gid/channels', (req, res) => {
  const g = getGroupById(req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  return res.json({ channels: g.channels });
});

// POST /api/groups/:gid/admins
router.post('/:gid/admins', (req, res) => {
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  const target = getUserByUsername(username);
  if (!target) return res.status(404).json({ error: 'user not found' });

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isGroupOwner) return res.status(403).json({ error: 'not authorized to add admins to this group' });

  if (!target.roles.includes('Group Admin') && !target.roles.includes('Super Admin')) {
    return res.status(400).json({ error: 'user must be a Group Admin (promoted by Super Admin) before adding as group admin' });
  }

  g.admins = g.admins || [];
  const exists = g.admins.some(a => normalize(a) === normalize(username));
  if (!exists) {
    g.admins.push(username.trim());
    saveData();
  }
  return res.status(201).json({ admins: g.admins });
});

// DELETE /api/groups/:gid/admins
router.delete('/:gid/admins', (req, res) => {
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });

  const target = getUserByUsername(username);
  if (!target) return res.status(404).json({ error: 'user not found' });
  if (normalize(username) === normalize(g.ownerUsername)) {
    return res.status(400).json({ error: 'cannot remove group owner from admins' });
  }

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isGroupOwner) return res.status(403).json({ error: 'not authorized to remove admins from this group' });

  const isAdmin = g.admins && g.admins.some(a => normalize(a) === normalize(username));
  if (!isAdmin) return res.status(404).json({ error: 'user is not an admin of this group' });

  g.admins = (g.admins || []).filter(a => normalize(a) !== normalize(username));
  saveData();
  return res.json({ admins: g.admins });
});

module.exports = router;
