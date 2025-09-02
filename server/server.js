const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // built-in JSON parser

// ID generator: prefix + timestamp + small random suffix to avoid collisions
const makeId = (prefix = 'u') => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

// In-memory store (Phase-1)
let users = [
  {
    id: 'u1',
    username: 'super',
    email: 'super@example.com',
    roles: ['Super Admin'],
    groups: []
  }
];

// --- AUTH (with password check) ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Invalid username/password' });

  // Password check (simple for Phase-1)
  if (user.password && user.password === password) return res.json({ user });

  // Backwards compatibility: default super password
  if (user.username === 'super' && password === '123') return res.json({ user });

  return res.status(401).json({ error: 'Invalid username/password' });
});

// --- USERS ---
app.get('/api/users', (req, res) => res.json({ users }));

app.post('/api/users', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !username.trim()) return res.status(400).json({ error: 'username required' });

  if (hasUser(username)) return res.status(409).json({ error: 'username taken' });

  const user = {
    id: makeId('u'),
    username: username.trim(),
    email: (email || '').trim(),
    password: password || '',
    roles: ['User'],
    groups: [] // will store group IDs
  };

  users.push(user);
  return res.status(201).json({ user });
});

// Change user role
app.put('/api/users/:id/role', (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};
  if (!role || !role.trim()) return res.status(400).json({ error: 'role required' });

  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const validRoles = ['Super Admin', 'Group Admin', 'User'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'invalid role' });

  user.roles = [role];
  return res.json({ user });
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'user not found' });

  const [deleted] = users.splice(idx, 1);
  // Remove user from all groups
  groups.forEach((g) => {
    g.members = g.members.filter((m) => normalize(m) !== normalize(deleted.username));
  });

  return res.json({ success: true });
});

// --- GROUPS + CHANNELS (new) ---
const makeGid = () => makeId('g');
const makeCid = () => makeId('c');

/**
 * groups: [
 *  { id, name, ownerUsername, members: [username], channels: [{id, name}] }
 * ]
 */
let groups = [
  {
    id: makeGid(),
    name: "General",
    ownerUsername: "super",
    members: ["super"],
    channels: [{ id: makeCid(), name: "general" }]
  }
];

// ---------- Helpers ----------

// Case-insensitive username helpers
const normalize = (s) => String(s || '').toLowerCase();

const hasUser = (username) => users.some((u) => normalize(u.username) === normalize(username));

const getUserByUsername = (username) => users.find((u) => normalize(u.username) === normalize(username));

const getUserById = (id) => users.find((u) => u.id === id);

// Group helpers
const getGroupById = (gid) => groups.find((g) => g.id === gid);

// Ensure user's groups[] contains gid
const attachGroupToUser = (username, gid) => {
  const u = getUserByUsername(username);
  if (!u) return;
  if (!u.groups.includes(gid)) u.groups.push(gid);
};

// List all groups (Phase-1: simple, no auth filtering)
app.get('/api/groups', (req, res) => res.json({ groups }));

// Create a group
// body: { name, ownerUsername }  (for Phase-1, pass owner explicitly)
app.post('/api/groups', (req, res) => {
  const { name, ownerUsername } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'group name required' });
  if (!ownerUsername?.trim()) return res.status(400).json({ error: 'ownerUsername required' });

  if (!hasUser(ownerUsername)) return res.status(404).json({ error: 'owner user not found' });

  const group = {
    id: makeGid(),
    name: name.trim(),
    ownerUsername: ownerUsername.trim(),
    members: [ownerUsername.trim()],
    channels: []
  };

  groups.push(group);
  attachGroupToUser(ownerUsername, group.id);

  return res.status(201).json({ group });
});

// Add a member to a group
// body: { username }
app.post('/api/groups/:gid/members', (req, res) => {
  const { gid } = req.params;
  const { username } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!hasUser(username)) return res.status(404).json({ error: 'user not found' });

  const already = g.members.some((m) => normalize(m) === normalize(username));
  if (!already) {
    g.members.push(username.trim());
    attachGroupToUser(username, g.id);
  }

  return res.status(201).json({ members: g.members });
});

  // Get group details (including members)
app.get('/api/groups/:gid', (req, res) => {
  const g = getGroupById(req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  return res.json({ id: g.id, name: g.name, ownerUsername: g.ownerUsername, members: g.members, channels: g.channels });
});

// List channels in a group
app.get('/api/groups/:gid/channels', (req, res) => {
  const g = getGroupById(req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  return res.json({ channels: g.channels });
});


// Delete a group
app.delete("/api/groups/:gid", (req, res) => {
  const { gid } = req.params;
  const idx = groups.findIndex(g => g.id === gid);
  if (idx === -1) return res.status(404).json({ error: "group not found" });
  const [deleted] = groups.splice(idx, 1);
  // Remove group from all users' groups arrays
  users.forEach(u => {
    u.groups = u.groups.filter(gidVal => gidVal !== gid);
  });
  res.json({ success: true });
});

// Create a channel in a group
// body: { name }
app.post("/api/groups/:gid/channels", (req, res) => {
  const g = groups.find(x => x.id === req.params.gid);
  if (!g) return res.status(404).json({ error: "group not found" });

  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "channel name required" });

  const taken = g.channels.some(c => c.name.toLowerCase() === name.toLowerCase());
  if (taken) return res.status(409).json({ error: "channel name taken in this group" });

  const channel = { id: makeCid(), name: name.trim() };
  g.channels.push(channel);
  res.status(201).json({ channel });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
