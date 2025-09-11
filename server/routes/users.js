const express = require('express');
const router = express.Router();
const {
  db,
  makeId,
  normalize,
  hasUser,
  getUserByUsername,
  getUserById,
  saveData
} = require('../dataStore');

// GET /api/users
router.get('/', (req, res) => res.json({ users: db.users }));

// POST /api/users
router.post('/', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !username.trim()) return res.status(400).json({ error: 'username required' });
  if (hasUser(username)) return res.status(409).json({ error: 'username taken' });

  const user = {
    id: makeId('u'),
    username: username.trim(),
    email: (email || '').trim(),
    password: password || '',
    roles: ['User'],
    groups: []
  };

  db.users.push(user);
  saveData();
  return res.status(201).json({ user });
});

// PUT /api/users/:id/role
router.put('/:id/role', (req, res) => {
  const { id } = req.params;
  const { role, requester } = req.body || {};
  if (!role || !role.trim()) return res.status(400).json({ error: 'role required' });

  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const prevRoles = Array.isArray(user.roles) ? [...user.roles] : [];
  const validRoles = ['Super Admin', 'Group Admin', 'User'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'invalid role' });

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if ((role === 'Group Admin' || role === 'Super Admin') && !isSuper) {
    return res.status(403).json({ error: 'only Super Admin can assign that role' });
  }
  if (!isSuper && role !== 'User') {
    return res.status(403).json({ error: 'not authorized to change role' });
  }

  user.roles = [role];
  const wasGroupAdmin = prevRoles.includes('Group Admin');
  const nowGroupAdmin = role === 'Group Admin';
  if (wasGroupAdmin && !nowGroupAdmin) {
    const uname = user.username;
    db.groups.forEach(g => {
      if (g.admins) g.admins = g.admins.filter(a => normalize(a) !== normalize(uname));
    });
  }
  saveData();
  return res.json({ user });
});

// PUT /api/users/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { username, email, password, requester } = req.body || {};

  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (normalize(user.username) === 'super') return res.status(403).json({ error: 'not allowed' });

  const reqUser = getUserByUsername(requester);
  if (!reqUser) return res.status(403).json({ error: 'requester not found' });
  if (reqUser.id !== id) return res.status(403).json({ error: 'not authorized to update this profile' });

  if (username && normalize(username) !== normalize(user.username)) {
    const exists = db.users.some(u => normalize(u.username) === normalize(username));
    if (exists) return res.status(409).json({ error: 'username taken' });
    user.username = username.trim();
  }
  if (email !== undefined) user.email = (email || '').trim();
  if (password !== undefined && String(password).trim() !== '') user.password = password;

  saveData();
  return res.json({ user });
});

// DELETE /api/users/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { requester } = req.body || {};
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'user not found' });

  const toDelete = db.users[idx];
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isSelf = reqUser && reqUser.id === id;
  if (!isSuper && !isSelf) return res.status(403).json({ error: 'not authorized to delete this user' });

  db.users.splice(idx, 1);
  // Remove user from all groups
  db.groups.forEach((g) => {
    g.members = g.members.filter((m) => normalize(m) !== normalize(toDelete.username));
    g.admins = (g.admins || []).filter(a => normalize(a) !== normalize(toDelete.username));
  });

  saveData();
  return res.json({ success: true });
});

module.exports = router;
