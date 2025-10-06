// Message persistence (Mongo) kept separate from socket code for clarity.
// Provides save + history retrieval constrained by group/channel.
const { getDb } = require('../db/mongo');

async function saveMessage({ id, groupId, channelId, username, text, ts }) {
  const { messages } = await ensureCollection();
  const doc = { id, groupId, channelId, username, text, ts };
  await messages.insertOne(doc);
  return doc;
}

async function history(groupId, channelId, { limit = 50 } = {}) {
  const { messages } = await ensureCollection();
  const q = { groupId, channelId };
  const cursor = messages.find(q).sort({ ts: -1 }).limit(limit);
  const list = await cursor.toArray();
  // Return newest last (chronological ascending)
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
