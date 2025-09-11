// Express app and middleware
const express = require('express');
const cors = require('cors');

const { loadData } = require('./dataStore');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Persistence / Data file ----------

// Data file for persistence (JSON)
const DATA_FILE = path.join(__dirname, 'data.json');

// Join requests will be persisted to the data file
let joinRequests = [];

function saveData() {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ users, groups, joinRequests }, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('Failed to save data file', err);
  }
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      if (Array.isArray(parsed.users)) users = parsed.users;
      if (Array.isArray(parsed.groups)) groups = parsed.groups;
  if (Array.isArray(parsed.joinRequests)) joinRequests = parsed.joinRequests;
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

// In-memory store
let users = [
  {
    id: 'u1',
    username: 'super',
    email: 'super@example.com',
    roles: ['Super Admin'],
    groups: []
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

const attachGroupToUser = (username, gid) => {
  const u = getUserByUsername(username);
  if (!u) return;
  if (!Array.isArray(u.groups)) u.groups = [];
  if (!u.groups.includes(gid)) u.groups.push(gid);
};

// ---------- AUTH (authentication) ----------
// Username/password check
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

// ---------- USERS ----------
// List all users
app.get('/api/users', (req, res) => res.json({ users }));

// Create a new user
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

// Update a user's profile (username, email, password)
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { username, email, password, requester } = req.body || {};

  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'user not found' });

  // Do not allow modifying the built-in super account via this endpoint
  if (normalize(user.username) === 'super') return res.status(403).json({ error: 'not allowed' });

  const reqUser = getUserByUsername(requester);
  if (!reqUser) return res.status(403).json({ error: 'requester not found' });

  // Only the user themselves may update their profile in this endpoint
  if (reqUser.id !== id) return res.status(403).json({ error: 'not authorized to update this profile' });

  // If username is changing, ensure uniqueness (case-insensitive)
  if (username && normalize(username) !== normalize(user.username)) {
    const exists = users.some(u => normalize(u.username) === normalize(username));
    if (exists) return res.status(409).json({ error: 'username taken' });
    user.username = username.trim();
  }

  if (email !== undefined) user.email = (email || '').trim();
  // Only update password when a non-empty value is provided. Leaving the field
  // blank in the UI will not overwrite the existing password.
  if (password !== undefined && String(password).trim() !== '') user.password = password;

  saveData();
  return res.json({ user });
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

// ---------- GROUPS & CHANNELS ----------
// Group and channel management routes
// Groups contain: id, name, ownerUsername, admins[], members[], channels[]
const makeGid = () => makeId('g');
const makeCid = () => makeId('c');

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

loadData();

// Mount modular routers
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api', require('./routes/requests')); // contains /requests and /groups/:gid/requests

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
