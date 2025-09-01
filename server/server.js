const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());   // built-in JSON parser

const makeId = (prefix = 'u') => `${prefix}${Date.now()}`;

let users = [
  { id: "u1", username: "super", email: "super@example.com", roles: ["Super Admin"], groups: [] }
];

// --- AUTH (minimal) ---
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "super" && password === "123") {
    return res.json({ user: users[0] });
  }
  res.status(401).json({ error: "Invalid username/password" });
});

// --- USERS ---
app.get("/api/users", (req, res) => {
  res.json({ users });
});

app.post("/api/users", (req, res) => {
  const { username, email } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: "username required" });
  }
  const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: "username taken" });
  }
  const user = {
    id: makeId('u'),
    username: username.trim(),
    email: (email || "").trim(),
    roles: ["User"],
    groups: []          // will store group IDs
  };
  users.push(user);
  res.status(201).json({ user });
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
    id: "g1",
    name: "General",
    ownerUsername: "super",
    members: ["super"],
    channels: [{ id: "c1", name: "general" }]
  }
];

// Helper: find user by username (case-insensitive)
const hasUser = (username) =>
  users.some(u => u.username.toLowerCase() === String(username).toLowerCase());

const getUser = (username) =>
  users.find(u => u.username.toLowerCase() === String(username).toLowerCase());

// Helper: ensure user's groups[] contains gid
const attachGroupToUser = (username, gid) => {
  const u = getUser(username);
  if (!u) return;
  if (!u.groups.includes(gid)) u.groups.push(gid);
};

// List all groups (Phase-1: simple, no auth filtering)
app.get("/api/groups", (req, res) => {
  res.json({ groups });
});

// Create a group
// body: { name, ownerUsername }  (for Phase-1, pass owner explicitly)
app.post("/api/groups", (req, res) => {
  const { name, ownerUsername } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "group name required" });
  if (!ownerUsername?.trim()) return res.status(400).json({ error: "ownerUsername required" });

  if (!hasUser(ownerUsername)) return res.status(404).json({ error: "owner user not found" });

  // optional: prevent exact name duplicates (case-insensitive)
  // if (groups.some(g => g.name.toLowerCase() === name.toLowerCase()))
  //   return res.status(409).json({ error: "group name taken" });

  const group = {
    id: makeGid(),
    name: name.trim(),
    ownerUsername: ownerUsername.trim(),
    members: [ownerUsername.trim()],
    channels: []
  };
  groups.push(group);
  attachGroupToUser(ownerUsername, group.id);

  res.status(201).json({ group });
});

// Add a member to a group
// body: { username }
app.post("/api/groups/:gid/members", (req, res) => {
  const { gid } = req.params;
  const { username } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  const g = groups.find(x => x.id === gid);
  if (!g) return res.status(404).json({ error: "group not found" });
  if (!hasUser(username)) return res.status(404).json({ error: "user not found" });

  const already = g.members.some(m => m.toLowerCase() === username.toLowerCase());
  if (!already) {
    g.members.push(username.trim());
    attachGroupToUser(username, g.id);
  }
  res.status(201).json({ members: g.members });
});

// List channels in a group
app.get("/api/groups/:gid/channels", (req, res) => {
  const g = groups.find(x => x.id === req.params.gid);
  if (!g) return res.status(404).json({ error: "group not found" });
  res.json({ channels: g.channels });
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
