// Minimal REST API for Phase-1 chat assignment.
// - Provides in-memory stores for users, groups, channels and join requests.
// - Persists state to `data.json` using an atomic write/rename pattern.
// This file intentionally keeps logic simple and synchronous for clarity.
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json()); // built-in JSON parser

// Data file for persistence (JSON)
const DATA_FILE = path.join(__dirname, 'data.json');

// Join requests will be persisted to the data file
let joinRequests = [];

/**
 * Persist in-memory data to disk atomically.
 * Writes a temporary file and renames it over the real data file to reduce
 * the risk of partial writes.
 */
function saveData() {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ users, groups, joinRequests }, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('Failed to save data file', err);
  }
}

/**
 * Load persisted data from disk and normalise structures.
 * This will override the in-memory defaults if the data file exists.
 * Defensive normalisation ensures older or trimmed data does not crash the server.
 */
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      if (Array.isArray(parsed.users)) users = parsed.users;
      if (Array.isArray(parsed.groups)) groups = parsed.groups;
  if (Array.isArray(parsed.joinRequests)) joinRequests = parsed.joinRequests;
      // Defensive normalization
      users = (users || []).map(u => ({
        ...u,
        groups: Array.isArray(u.groups) ? u.groups : [],
        roles: Array.isArray(u.roles) ? u.roles : (u.roles ? [u.roles] : [])
      }));
      groups = (groups || []).map(g => ({
        ...g,
        members: Array.isArray(g.members) ? g.members : [],
        admins: Array.isArray(g.admins) ? g.admins : [],
        channels: Array.isArray(g.channels) ? g.channels : []
      }));
      joinRequests = Array.isArray(joinRequests) ? joinRequests : [];
    } else {
      // no data file yet — write defaults
      saveData();
    }
  } catch (err) {
    console.error('Failed to load data file', err);
  }
}

// ID generator: prefix + timestamp + small random suffix to avoid collisions
// makeId: simple unique id generator for Phase-1. Not cryptographically secure.
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
  saveData();
  return res.status(201).json({ user });
});

// Change user role
app.put('/api/users/:id/role', (req, res) => {
  const { id } = req.params;
  const { role, requester } = req.body || {};
  if (!role || !role.trim()) return res.status(400).json({ error: 'role required' });

  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const prevRoles = Array.isArray(user.roles) ? [...user.roles] : [];

  const validRoles = ['Super Admin', 'Group Admin', 'User'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'invalid role' });

  // Only Super Admin can promote to Group Admin or Super Admin
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if ((role === 'Group Admin' || role === 'Super Admin') && !isSuper) {
    return res.status(403).json({ error: 'only Super Admin can assign that role' });
  }

  // Allow Super Admin to set any role; allow demotion to 'User' by Super Admin as well
  if (!isSuper && role !== 'User') {
    return res.status(403).json({ error: 'not authorized to change role' });
  }

  user.roles = [role];
  // If the user was a Group Admin and is no longer a Group Admin, remove them from all group.admins
  const wasGroupAdmin = prevRoles.includes('Group Admin');
  const nowGroupAdmin = role === 'Group Admin';
  if (wasGroupAdmin && !nowGroupAdmin) {
    const uname = user.username;
    groups.forEach(g => {
      if (g.admins) g.admins = g.admins.filter(a => normalize(a) !== normalize(uname));
    });
  }
  saveData();
  return res.json({ user });
});


// Remove an admin from a group
// body: { username, requester }
app.delete('/api/groups/:gid/admins', (req, res) => {
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });

  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isGroupOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isGroupOwner) return res.status(403).json({ error: 'not authorized to remove admins from this group' });

  const exists = (g.admins || []).some(a => normalize(a) === normalize(username));
  if (!exists) return res.status(404).json({ error: 'admin not found in group' });

  g.admins = (g.admins || []).filter(a => normalize(a) !== normalize(username));
  saveData();
  return res.json({ admins: g.admins });
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { requester } = req.body || {};
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'user not found' });

  const toDelete = users[idx];
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isSelf = reqUser && reqUser.id === id;
  if (!isSuper && !isSelf) return res.status(403).json({ error: 'not authorized to delete this user' });

  const [deleted] = users.splice(idx, 1);
  // Remove user from all groups
  groups.forEach((g) => {
    g.members = g.members.filter((m) => normalize(m) !== normalize(deleted.username));
    g.admins = (g.admins || []).filter(a => normalize(a) !== normalize(deleted.username));
  });

  saveData();

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
    name: 'General',
    ownerUsername: 'super',
    admins: ['super'],
    members: ['super'],
    channels: [{ id: makeCid(), name: 'general' }]
  }
];

// Load persisted data (overrides defaults if data file exists)
loadData();

const makeRid = () => makeId('r');

// ---------- Helpers ----------

// Case-insensitive username helpers
/**
 * Normalize a username (or string) to a canonical lowercase representation
 * for case-insensitive comparisons.
 */
const normalize = (s) => String(s || '').toLowerCase();

const hasUser = (username) => users.some((u) => normalize(u.username) === normalize(username));

const getUserByUsername = (username) => users.find((u) => normalize(u.username) === normalize(username));

const getUserById = (id) => users.find((u) => u.id === id);

// Group helpers
const getGroupById = (gid) => groups.find((g) => g.id === gid);

/**
 * Ensure a user's `groups` array contains the given gid.
 * Creates the array if missing (defensive).
 */
const attachGroupToUser = (username, gid) => {
  const u = getUserByUsername(username);
  if (!u) return;
  if (!Array.isArray(u.groups)) u.groups = [];
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

  // Only Group Admins or Super Admins can create groups
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

  groups.push(group);
  attachGroupToUser(ownerUsername, group.id);

  saveData();
  return res.status(201).json({ group });
});

// Request to join a group
// body: { username }
app.post('/api/groups/:gid/requests', (req, res) => {
  const { gid } = req.params;
  const { username } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!hasUser(username)) return res.status(404).json({ error: 'user not found' });

  // If already a member, no need to request
  if (g.members.some(m => normalize(m) === normalize(username))) {
    return res.status(400).json({ error: 'user already a member' });
  }

  const exists = joinRequests.some(r => r.gid === gid && normalize(r.username) === normalize(username) && r.status === 'pending');
  if (exists) return res.status(409).json({ error: 'request already pending' });

  const reqObj = { id: makeRid(), gid, username: username.trim(), status: 'pending', createdAt: Date.now() };
  joinRequests.push(reqObj);
  saveData();
  return res.status(201).json({ request: reqObj });
});

// List all pending join requests (Super Admin only)
app.get('/api/requests', (req, res) => {
  const { requester } = req.query || {};
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can list requests' });

  const pending = joinRequests.filter(r => r.status === 'pending');
  return res.json({ requests: pending });
});

// Approve a join request (Super Admin only) -> adds user to group
app.put('/api/requests/:rid/approve', (req, res) => {
  const { rid } = req.params;
  const { requester } = req.body || {};
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can approve requests' });

  const r = joinRequests.find(x => x.id === rid);
  if (!r) return res.status(404).json({ error: 'request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'request already processed' });

  const g = getGroupById(r.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });

  // add member
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

// Deny a join request (Super Admin only)
app.put('/api/requests/:rid/deny', (req, res) => {
  const { rid } = req.params;
  const { requester } = req.body || {};
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  if (!isSuper) return res.status(403).json({ error: 'only Super Admin can deny requests' });

  const r = joinRequests.find(x => x.id === rid);
  if (!r) return res.status(404).json({ error: 'request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'request already processed' });

  r.status = 'denied';
  r.processedBy = requester;
  r.processedAt = Date.now();
  saveData();
  return res.json({ request: r });
});

// Add a member to a group
// body: { username }
app.post('/api/groups/:gid/members', (req, res) => {
  const { gid } = req.params;
  const { username, requester } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });

  const g = getGroupById(gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  if (!hasUser(username)) return res.status(404).json({ error: 'user not found' });

  // Only group owner, a group admin for this group, or Super Admin can add members
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

  // Get group details (including members)
app.get('/api/groups/:gid', (req, res) => {
  const g = getGroupById(req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });
  return res.json({ id: g.id, name: g.name, ownerUsername: g.ownerUsername, members: g.members, channels: g.channels });
});

  // Add an admin to a group
  // body: { username, requester }
  app.post('/api/groups/:gid/admins', (req, res) => {
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

    // Target user must already have Group Admin role (promoted by Super Admin)
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

  // Remove a member from a group
  // body: { username, requester }
  app.delete('/api/groups/:gid/members', (req, res) => {
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
    // Also detach group from user's groups list
    const u = getUserByUsername(username);
    if (u) u.groups = u.groups.filter(gidVal => gidVal !== gid);
  saveData();
  return res.json({ members: g.members });
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
  const { requester } = req.body || {};
  const idx = groups.findIndex(g => g.id === gid);
  if (idx === -1) return res.status(404).json({ error: 'group not found' });
  const g = groups[idx];

  // Authorization: Only group owner or Super Admin can delete a group
  const reqUser = getUserByUsername(requester);
  const isSuper = reqUser && reqUser.roles.includes('Super Admin');
  const isOwner = normalize(g.ownerUsername) === normalize(requester);
  if (!isSuper && !isOwner) return res.status(403).json({ error: 'not authorized to delete group' });

  const [deleted] = groups.splice(idx, 1);
  // Remove group from all users' groups arrays
  users.forEach(u => {
    u.groups = u.groups.filter(gidVal => gidVal !== gid);
  });
  saveData();
  res.json({ success: true });
});

// Create a channel in a group
// body: { name }
app.post("/api/groups/:gid/channels", (req, res) => {
  const g = groups.find(x => x.id === req.params.gid);
  if (!g) return res.status(404).json({ error: 'group not found' });

  const { name, requester } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'channel name required' });

  // Only group owner, a group admin for this group, or Super Admin can create channels
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
