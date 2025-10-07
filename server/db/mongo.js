const { MongoClient } = require('mongodb');

// Configuration (override via env when deploying/containerizing)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'chatapp';

let client; // MongoClient instance
let db; // Connected DB instance
let collections; // { users, groups, joinRequests }

// Id helpers (legacy readable style; consider nanoid/shortid later)
function makeId(prefix = 'u') {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
const makeGid = () => makeId('g');
const makeCid = () => makeId('c');
const makeRid = () => makeId('r');
const normalize = (s) => String(s || '').toLowerCase();

/**
 * Establish connection (idempotent). Subsequent calls return cached handles.
 * @returns {Promise<{db: import('mongodb').Db, users, groups, joinRequests}>}
 */
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
  await ensureIndexes();
  return { db, ...collections };
}

async function ensureIndexes() {
  const { users, groups, joinRequests } = collections;
  // Users
  await users.createIndex({ username: 1 }, { unique: true });
  await users.createIndex({ id: 1 }, { unique: true });
  // Groups
  await groups.createIndex({ id: 1 }, { unique: true });
  await groups.createIndex({ name: 1 });
  // Join Requests
  await joinRequests.createIndex({ gid: 1, username: 1, status: 1 });
}

function getCollections() {
  if (!collections) throw new Error('Mongo not connected yet');
  return collections;
}

function getDb() {
  if (!db) throw new Error('Mongo not connected yet');
  return db;
}

async function disconnectMongo() {
  if (client) {
    await client.close();
    client = undefined; db = undefined; collections = undefined;
  }
}

module.exports = {
  connectMongo,
  disconnectMongo,
  getCollections,
  getDb,
  makeId,
  makeGid,
  makeCid,
  makeRid,
  normalize
};
