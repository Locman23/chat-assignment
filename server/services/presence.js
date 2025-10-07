// In-memory presence tracking (not persisted). Supports multi-tab by counting socket instances.
// roomKey => username(lower) => { username, sockets: Set<socketId> }
const roomUsers = new Map();

function addPresence(room, username, socketId) {
  if (!room || !username) return;
  let userMap = roomUsers.get(room);
  if (!userMap) { userMap = new Map(); roomUsers.set(room, userMap); }
  const key = username.toLowerCase();
  const entry = userMap.get(key) || { username, sockets: new Set() };
  entry.sockets.add(socketId);
  userMap.set(key, entry);
}

function removePresence(room, username, socketId) {
  if (!room || !username) return;
  const userMap = roomUsers.get(room);
  if (!userMap) return;
  const key = username.toLowerCase();
  const entry = userMap.get(key);
  if (!entry) return;
  if (socketId) entry.sockets.delete(socketId);
  if (!socketId || entry.sockets.size === 0) {
    userMap.delete(key);
  } else {
    userMap.set(key, entry);
  }
  if (userMap.size === 0) roomUsers.delete(room);
}

function listPresence(room) {
  const userMap = roomUsers.get(room);
  if (!userMap) return [];
  return Array.from(userMap.values()).map(v => v.username).sort((a,b)=>a.localeCompare(b));
}

// Determine status of a username relative to a specific room.
// Returns 'active' if in this room, 'online' if in some other room, else 'offline'.
function userStatus(username, currentRoom) {
  if (!username) return 'offline';
  const target = username.toLowerCase();
  let foundElsewhere = false;
  for (const [room, userMap] of roomUsers.entries()) {
    if (userMap.has(target)) {
      if (room === currentRoom) return 'active';
      foundElsewhere = true;
    }
  }
  return foundElsewhere ? 'online' : 'offline';
}

function buildRoster(usernames, currentRoom) {
  return (usernames || []).map(u => ({ username: u, status: userStatus(u, currentRoom) }));
}

module.exports = { addPresence, removePresence, listPresence, userStatus, buildRoster };
