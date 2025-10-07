// Message persistence: save chat messages and retrieve channel history.
const { getDb } = require('../db/mongo');
const { ATTACHMENT_MAX_PER_MESSAGE, DEFAULT_HISTORY_LIMIT } = require('../constants');

// Assumes avatarUrl & attachment URLs are relative (e.g. /uploads/file.png); sockets layer emits absolute variants.
async function saveMessage({ id, groupId, channelId, username, text, ts, attachments, avatarUrl }) {
  const { messages } = await ensureCollection();
  const doc = { id, groupId, channelId, username, text, ts };
  if (attachments && Array.isArray(attachments) && attachments.length) {
    // Cap attachments by ATTACHMENT_MAX_PER_MESSAGE
    doc.attachments = attachments.slice(0, ATTACHMENT_MAX_PER_MESSAGE).map(a => ({ ...a }));
  }
  if (avatarUrl) doc.avatarUrl = avatarUrl; // relative path only
  await messages.insertOne(doc);
  return doc;
}

// Retrieve channel messages (chronological ascending) with optional pagination.
async function history(groupId, channelId, { limit = DEFAULT_HISTORY_LIMIT, beforeTs } = {}) {
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
