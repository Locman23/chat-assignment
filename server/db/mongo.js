const { MongoClient } = require('mongodb');

// Static configuration (can be moved to env vars later)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'chatapp';

let client; let db; let collections;

// Simple id helpers (retain legacy readable id style)
const makeId = (prefix = 'u') => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
const makeGid = () => makeId('g');
const makeCid = () => makeId('c');
const makeRid = () => makeId('r');
const normalize = (s) => String(s || '').toLowerCase();

async function connectMongo() {
  if (db) return { db, ...collections };
  client = new MongoClient(MONGODB_URI, { ignoreUndefined: true });
  await client.connect();
  db = client.db(DB_NAME);
  collections = {
    users: db.collection('users'),
    groups: db.collection('groups'),
    joinRequests: db.collection('joinRequests')
  };

  // Indexes (id fields are our custom ids, not the Mongo _id)
  await collections.users.createIndex({ username: 1 }, { unique: true });
  await collections.users.createIndex({ id: 1 }, { unique: true });
  await collections.groups.createIndex({ id: 1 }, { unique: true });
  await collections.groups.createIndex({ name: 1 });
  await collections.joinRequests.createIndex({ gid: 1, username: 1, status: 1 });

  return { db, ...collections };
}

function getCollections() {
  if (!collections) throw new Error('Mongo not connected yet');
  return collections;
}

module.exports = {
  connectMongo,
  getCollections,
  makeId,
  makeGid,
  makeCid,
  makeRid,
  normalize
};
