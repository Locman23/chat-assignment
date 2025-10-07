// In-memory typing indicator tracking per room.
// Structure: roomId -> Map<username, lastActivityTs>

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

/**
 * Update typing state for a user. When isTyping=false the entry is removed.
 */
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

/**
 * Return sorted list of users currently typing (stale entries pruned first).
 */
function listTyping(room) {
  cleanup(room);
  const map = roomTyping.get(room);
  if (!map) return [];
  return Array.from(map.keys()).sort();
}

/**
 * Explicitly clear a user's typing state in a room.
 */
function clearTyping(room, username) {
  if (!room || !username) return;
  const map = roomTyping.get(room);
  if (!map) return;
  map.delete(username);
  if (map.size === 0) roomTyping.delete(room);
}

/**
 * Reset all typing state (primarily for tests or hot reload scenarios).
 */
function _resetAll() {
  roomTyping.clear();
}

module.exports = { setTyping, listTyping, clearTyping, TYPING_TIMEOUT_MS, _resetAll };
