const { Server } = require('socket.io');
const { getCollections, normalize } = require('./db/mongo');
const { saveMessage, history } = require('./services/messageStore');

async function getUserByUsername(username) {
  if (!username) return null;
  const { users } = getCollections();
  return users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
}
async function getGroupById(gid) { const { groups } = getCollections(); return groups.findOne({ id: gid }); }

function roomId(groupId, channelId) {
  return `${groupId}:${channelId}`;
}

async function canJoinGroup(username, group) {
  if (!group) return false;
  const user = await getUserByUsername(username);
  if (!user) return false;
  const isSuper = (user.roles || []).some(r => r === 'Super Admin');
  const isMember = (group.members || []).map(normalize).includes(normalize(username));
  return isSuper || isMember;
}

function channelExists(group, channelId) {
  if (!group) return false;
  if (!channelId) return false;
  return (group.channels || []).some((c) => String(c.id) === String(channelId));
}

function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }
  });

  io.on('connection', (socket) => {
    console.log('[io] client connected', socket.id);
    // Client should provide { username, groupId, channelId }
    socket.on('chat:join', async ({ username, groupId, channelId }, ack) => {
      try {
        const g = await getGroupById(groupId);
        if (!g) return ack && ack({ ok: false, error: 'group not found' });
        if (!(await canJoinGroup(username, g))) return ack && ack({ ok: false, error: 'not a member of this group' });
        if (!channelExists(g, channelId)) return ack && ack({ ok: false, error: 'channel not found' });

        // Leave previous room if any
        const prev = socket.data?.room;
        if (prev) socket.leave(prev);

        const rid = roomId(groupId, channelId);
        socket.data = { username, groupId, channelId, room: rid };
        socket.join(rid);
        console.log('[io] join', { sid: socket.id, username, groupId, channelId, rid });
        // Load recent history (default 50) and include in ack
        const recent = await history(groupId, channelId, { limit: 50 });
        ack && ack({ ok: true, history: recent });
      } catch (e) {
        console.error('[io] join error', e);
        ack && ack({ ok: false, error: 'join failed' });
      }
    });

    socket.on('chat:leave', (_payload, ack) => {
      const prev = socket.data?.room;
      if (prev) socket.leave(prev);
      socket.data = {};
      ack && ack({ ok: true });
    });

    // Client sends { text }
    socket.on('chat:message', async ({ text }, ack) => {
      const { username, groupId, channelId, room } = socket.data || {};
      if (!room || !groupId || !channelId) return ack && ack({ ok: false, error: 'not in a room' });
      const g = await getGroupById(groupId);
      if (!(await canJoinGroup(username, g))) return ack && ack({ ok: false, error: 'not a member' });
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        username: String(username || 'unknown'),
        groupId,
        channelId,
        text: String(text || ''),
        ts: Date.now()
      };
      try {
        await saveMessage(msg);
        io.to(room).emit('chat:message', msg);
        console.log('[io] msg', { room, username, text: msg.text });
        ack && ack({ ok: true, message: msg });
      } catch (persistErr) {
        console.error('[io] persist error', persistErr);
        ack && ack({ ok: false, error: 'persist failed' });
      }
    });
  });

  return io;
}

module.exports = { initSockets };
