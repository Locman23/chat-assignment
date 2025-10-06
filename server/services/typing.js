// In-memory typing indicator tracking per room.
// Structure: roomId -> { username -> lastActivityTs }

const TYPING_TIMEOUT_MS = 5000; // how long (ms) before a typing entry is considered stale

const roomTyping = new Map();

function cleanup(room) {
  const map = roomTyping.get(room);
  if (!map) return;
  const now = Date.now();
  for (const [user, ts] of map.entries()) {
    if (now - ts > TYPING_TIMEOUT_MS) {
      map.delete(user);
    }
  }
  if (map.size === 0) roomTyping.delete(room);
}

function setTyping(room, username, isTyping) {
  if (!room || !username) return;
  let map = roomTyping.get(room);
  if (!map) {
    if (!isTyping) return; // nothing to clear
    map = new Map();
    roomTyping.set(room, map);
  }
  if (isTyping) {
    map.set(username, Date.now());
  } else {
    map.delete(username);
    if (map.size === 0) roomTyping.delete(room);
  }
}

function listTyping(room) {
  cleanup(room);
  const map = roomTyping.get(room);
  if (!map) return [];
  return Array.from(map.keys()).sort();
}

function clearTyping(room, username) {
  if (!room || !username) return;
  const map = roomTyping.get(room);
  if (!map) return;
  map.delete(username);
  if (map.size === 0) roomTyping.delete(room);
}

module.exports = { setTyping, listTyping, clearTyping, TYPING_TIMEOUT_MS };
