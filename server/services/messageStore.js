// Message persistence (Mongo) kept separate from socket code for clarity.
// Provides save + history retrieval constrained by group/channel.
const { getDb } = require('../db/mongo');

// saveMessage expects avatarUrl and attachment URLs to already be normalized to relative paths
// (e.g. /uploads/filename.png). The socket layer is responsible for converting relative -> absolute
// when emitting to clients while keeping only the relative path in persistence per requirements.
async function saveMessage({ id, groupId, channelId, username, text, ts, attachments, avatarUrl }) {
  const { messages } = await ensureCollection();
  const doc = { id, groupId, channelId, username, text, ts };
  if (attachments && Array.isArray(attachments) && attachments.length) {
    // Persist only first 4 attachments (soft cap) and only relative URLs
    doc.attachments = attachments.slice(0, 4).map(a => ({ ...a }));
  }
  if (avatarUrl) doc.avatarUrl = avatarUrl; // relative path only
  await messages.insertOne(doc);
  return doc;
}

// Retrieve messages newest-last (chronological ascending).
// Options:
//  - limit (default 50)
//  - beforeTs: only messages with ts < beforeTs (for pagination backwards)
async function history(groupId, channelId, { limit = 50, beforeTs } = {}) {
  const { messages } = await ensureCollection();
  const q = { groupId, channelId };
  if (beforeTs) {
    q.ts = { $lt: Number(beforeTs) };
  }
  const cursor = messages.find(q, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(limit);
  const list = await cursor.toArray();
  return list.reverse();
}

let _hasInit = false;
async function ensureCollection() {
  const messages = getDb().collection('messages');
  if (!_hasInit) {
    await messages.createIndex({ groupId: 1, channelId: 1, ts: -1 });
    await messages.createIndex({ id: 1 }, { unique: true });
    _hasInit = true;
  }
  return { messages };
}

module.exports = { saveMessage, history };
