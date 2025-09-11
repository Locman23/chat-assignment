// Shared in-memory data store and helpers for the chat assignment API.
// Responsible for persistence to data.json and utility functions.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// Simple unique id generator (not secure)
const makeId = (prefix = 'u') => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
const makeGid = () => makeId('g');
const makeCid = () => makeId('c');
const makeRid = () => makeId('r');

// In-memory database (exported by reference)
const db = {
  users: [
    {
      id: 'u1',
      username: 'super',
      email: 'super@example.com',
      roles: ['Super Admin'],
      groups: []
    }
  ],
  groups: [
    {
      id: makeGid(),
      name: 'General',
      ownerUsername: 'super',
      admins: ['super'],
      members: ['super'],
      channels: [{ id: makeCid(), name: 'general' }]
    }
  ],
  joinRequests: []
};

// ---------- Helpers ----------
const normalize = (s) => String(s || '').toLowerCase();

const hasUser = (username) => db.users.some((u) => normalize(u.username) === normalize(username));
const getUserByUsername = (username) => db.users.find((u) => normalize(u.username) === normalize(username));
const getUserById = (id) => db.users.find((u) => u.id === id);
const getGroupById = (gid) => db.groups.find((g) => g.id === gid);

const attachGroupToUser = (username, gid) => {
  const u = getUserByUsername(username);
  if (!u) return;
  if (!Array.isArray(u.groups)) u.groups = [];
  if (!u.groups.includes(gid)) u.groups.push(gid);
};

// ---------- Persistence ----------
function saveData() {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ users: db.users, groups: db.groups, joinRequests: db.joinRequests }, null, 2), 'utf8');
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

      if (Array.isArray(parsed.users)) db.users = parsed.users;
      if (Array.isArray(parsed.groups)) db.groups = parsed.groups;
      if (Array.isArray(parsed.joinRequests)) db.joinRequests = parsed.joinRequests;

      // Defensive normalization
      db.users = (db.users || []).map(u => ({
        ...u,
        groups: Array.isArray(u.groups) ? u.groups : [],
        roles: Array.isArray(u.roles) ? u.roles : (u.roles ? [u.roles] : [])
      }));
      db.groups = (db.groups || []).map(g => ({
        ...g,
        members: Array.isArray(g.members) ? g.members : [],
        admins: Array.isArray(g.admins) ? g.admins : [],
        channels: Array.isArray(g.channels) ? g.channels : []
      }));
      db.joinRequests = Array.isArray(db.joinRequests) ? db.joinRequests : [];
    } else {
      saveData();
    }
  } catch (err) {
    console.error('Failed to load data file', err);
  }
}

module.exports = {
  db,
  DATA_FILE,
  makeId,
  makeGid,
  makeCid,
  makeRid,
  normalize,
  hasUser,
  getUserByUsername,
  getUserById,
  getGroupById,
  attachGroupToUser,
  saveData,
  loadData
};
