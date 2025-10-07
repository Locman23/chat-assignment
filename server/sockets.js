const { Server } = require('socket.io');
const { getCollections, normalize } = require('./db/mongo');
const { saveMessage, history } = require('./services/messageStore');
const { addPresence, removePresence, listPresence, buildRoster } = require('./services/presence');
const { setTyping, listTyping, clearTyping } = require('./services/typing');
const logger = require('./utils/logger');

async function getUserByUsername(username) {
  if (!username) return null;
  const { users } = getCollections();
  return users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
}
async function getGroupById(gid) { const { groups } = getCollections(); return groups.findOne({ id: gid }); }
const { publicBase } = require('./utils/base');
const { DEFAULT_HISTORY_LIMIT } = require('./constants');

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

    async function emitSystem(ioRef, room, { groupId, channelId }, text) {
      if (!room) return;
  logger.debug('[system] attempt', { room, groupId, channelId, text });
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        username: 'system',
        groupId,
        channelId,
        text,
        ts: Date.now()
      };
      try {
        await saveMessage(msg);
        ioRef.to(room).emit('chat:message', msg);
        logger.debug('[system] sent');
      } catch (e) {
        logger.error('system message persist error', e);
      }
    }

  io.on('connection', (socket) => {
  logger.debug('client connected', { sid: socket.id });
    socket.on('chat:join', async ({ username, groupId, channelId }, ack) => {
      try {
  logger.debug('[join] attempt', { sid: socket.id, username, groupId, channelId });
        const g = await getGroupById(groupId);
  if (!g) { logger.warn('[join] group not found'); return ack && ack({ ok: false, error: 'group not found' }); }
  if (!(await canJoinGroup(username, g))) { logger.warn('[join] membership denied'); return ack && ack({ ok: false, error: 'not a member of this group' }); }
  if (!channelExists(g, channelId)) { logger.warn('[join] channel not found'); return ack && ack({ ok: false, error: 'channel not found' }); }

        // Leave previous room if any
        const prev = socket.data?.room;
        if (prev) {
          // Emit leave before leaving so room members receive it
          const { groupId: pgid, channelId: pcid, username: prevUser } = socket.data || {};
            await emitSystem(io, prev, { groupId: pgid, channelId: pcid }, `${prevUser || 'A user'} left the channel`);
          socket.leave(prev);
        }

        const rid = roomId(groupId, channelId);
        socket.data = { username, groupId, channelId, room: rid };
        socket.join(rid);
  logger.debug('join success', { sid: socket.id, username, groupId, channelId, rid });
  // Load recent history using configured default limit
  const { DEFAULT_HISTORY_LIMIT } = require('./constants');
  const recent = await history(groupId, channelId, { limit: DEFAULT_HISTORY_LIMIT });
  // Build roster (with avatars) for immediate display
        let enrichedRoster = [];
        try {
          enrichedRoster = await buildRosterWithAvatars(g, rid);
        } catch (e) {
          logger.warn('join roster enrichment failed', e);
        }
        ack && ack({ ok: true, history: recent, roster: enrichedRoster });
  // System join after ack so client can render history first
        emitSystem(io, rid, { groupId, channelId }, `${username} joined the channel`).catch(()=>{});
  // Presence update
        addPresence(rid, username, socket.id);
        io.to(rid).emit('chat:presence', { users: listPresence(rid) });
  // Push current roster
        broadcastRoster(io, rid, g);
      } catch (e) {
        logger.error('join error', e);
        ack && ack({ ok: false, error: 'join failed' });
      }
    });

    socket.on('chat:leave', async (_payload, ack) => {
      const prev = socket.data?.room;
      if (prev) {
        const { groupId: pgid, channelId: pcid, username: prevUser } = socket.data || {};
        await emitSystem(io, prev, { groupId: pgid, channelId: pcid }, `${prevUser || 'A user'} left the channel`);
        removePresence(prev, prevUser, socket.id);
        clearTyping(prev, prevUser);
        io.to(prev).emit('chat:presence', { users: listPresence(prev) });
  // Update roster for previous room
        const g = await getGroupById(pgid);
        broadcastRoster(io, prev, g);
        socket.leave(prev);
      }
      socket.data = {};
      ack && ack({ ok: true });
    });

    socket.on('disconnect', async () => {
      try {
        const prev = socket.data?.room;
        if (prev) {
          const { groupId, channelId, username } = socket.data || {};
          await emitSystem(io, prev, { groupId, channelId }, `${username || 'A user'} left the channel`);
          removePresence(prev, username, socket.id);
          clearTyping(prev, username);
          io.to(prev).emit('chat:presence', { users: listPresence(prev) });
          const g = await getGroupById(groupId);
          broadcastRoster(io, prev, g);
        }
      } catch (e) {
        logger.error('disconnect system message failed', e);
      }
    });

    // Client sends { text }
    socket.on('chat:message', async ({ text, imageUrl, attachments }, ack) => {
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
        ts: Date.now(),
        attachments: []
      };
      // Fetch avatarUrl for sender (if any)
      try {
        const { getCollections } = require('./db/mongo');
        const { users } = getCollections();
        const uDoc = await users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } }, { projection: { avatarUrl: 1 } });
        if (uDoc?.avatarUrl) {
          const { publicBase } = require('./utils/base');
          const base = publicBase();
          msg.avatarUrl = `${base}${uDoc.avatarUrl}`;
        }
      } catch (e) {
        logger.warn('attach avatar to message failed', e);
      }
      // Support either single imageUrl or array attachments passed explicitly
      if (imageUrl) {
        msg.attachments.push({ type: 'image', url: String(imageUrl) }); // may be absolute from upload endpoint
      }
      if (Array.isArray(attachments)) {
        for (const a of attachments) {
          if (a && a.type === 'image' && a.url) msg.attachments.push({ type: 'image', url: String(a.url) });
        }
      }
      if (!msg.attachments.length) delete msg.attachments; // keep schema clean when none
      try {
        // Build persistence clone with relative URLs only
  const { publicBase } = require('./utils/base');
  const base = publicBase();
        const persistMsg = { ...msg };
        // Normalize avatarUrl to relative
        if (persistMsg.avatarUrl && persistMsg.avatarUrl.startsWith(base)) {
          persistMsg.avatarUrl = persistMsg.avatarUrl.slice(base.length);
        }
        // Normalize attachment URLs to relative if they were returned absolute
        if (Array.isArray(persistMsg.attachments)) {
          persistMsg.attachments = persistMsg.attachments.map(a => {
            if (a.url && a.url.startsWith(base)) {
              return { ...a, url: a.url.slice(base.length) };
            }
            return a;
          });
        }
        await saveMessage(persistMsg);
        io.to(room).emit('chat:message', msg);
        logger.debug('message', { room, username, len: msg.text.length });
        ack && ack({ ok: true, message: msg });
        // After sending a message, mark the user as no longer typing (natural end of typing burst)
        setTyping(room, username, false);
        io.to(room).emit('chat:typing', { users: listTyping(room) });
      } catch (persistErr) {
        logger.error('persist error', persistErr);
        ack && ack({ ok: false, error: 'persist failed' });
      }
    });

    // Typing indicator: client emits { isTyping: boolean }
    socket.on('chat:typing', ({ isTyping }, ack) => {
      const { username, room } = socket.data || {};
      if (!room || !username) return ack && ack({ ok: false });
      setTyping(room, username, !!isTyping);
  // Broadcast updated typing users
      io.to(room).emit('chat:typing', { users: listTyping(room) });
      ack && ack({ ok: true });
    });

    // Client may explicitly request roster refresh
    socket.on('chat:roster:request', async (_payload, ack) => {
      const { groupId, room } = socket.data || {};
      if (!groupId || !room) return ack && ack({ ok: false });
      const g = await getGroupById(groupId);
      if (!g) return ack && ack({ ok: false });
      let roster = buildRoster(g.members || [], room);
      try {
        const { getCollections } = require('./db/mongo');
        const { users } = getCollections();
        const names = (g.members || []).map(u => u).filter(Boolean);
        if (names.length) {
          const userDocs = await users.find({ username: { $in: names } }).project({ username: 1, avatarUrl: 1, _id: 0 }).toArray();
          const map = new Map(userDocs.map(u => [String(u.username).toLowerCase(), u.avatarUrl]));
          roster = roster.map(r => ({ ...r, avatarUrl: map.get(r.username.toLowerCase()) }));
        }
      } catch (e) {
        logger.warn('roster request avatar enrichment failed', e);
      }
      const base = process.env.PUBLIC_BASE || 'http://localhost:3000';
      const withAbs = roster.map(r => ({ ...r, avatarUrl: r.avatarUrl ? `${base}${r.avatarUrl}` : undefined }));
      ack && ack({ ok: true, roster: withAbs });
    });
  });

  // (Global disconnect handler removed; per-socket disconnect is inside connection scope.)

  return io;
}

// Helper to broadcast roster to a specific room (using group data passed or fetched)
async function broadcastRoster(io, room, group) {
  try {
    if (!group) return;
    const rosterBase = buildRoster(group.members || [], room);
    // Enrich with avatarUrl (relative) from users collection
    let enriched = rosterBase;
    try {
      const { getCollections } = require('./db/mongo');
      const { users } = getCollections();
      const names = (group.members || []).map(u => u).filter(Boolean);
      if (names.length) {
        const userDocs = await users.find({ username: { $in: names } }).project({ username: 1, avatarUrl: 1, _id: 0 }).toArray();
        const map = new Map(userDocs.map(u => [String(u.username).toLowerCase(), u.avatarUrl]));
        enriched = rosterBase.map(r => ({ ...r, avatarUrl: map.get(r.username.toLowerCase()) }));
      }
    } catch (e) {
      logger.warn('roster avatar enrichment failed', e);
    }
  const { publicBase } = require('./utils/base');
  const base = publicBase();
  const withAbs = enriched.map(r => ({ ...r, avatarUrl: r.avatarUrl ? `${base}${r.avatarUrl}` : undefined }));
  logger.debug('roster broadcast', { room, members: (group.members||[]).length });
  io.to(room).emit('chat:roster', { roster: withAbs });
  } catch (e) {
    logger.error('roster broadcast failed', e);
  }
}

// Build roster entries with absolute avatar URLs
async function buildRosterWithAvatars(group, room) {
  if (!group) return [];
  const baseRoster = buildRoster(group.members || [], room);
  try {
    const { getCollections } = require('./db/mongo');
    const { users } = getCollections();
    const names = (group.members || []).map(u => u).filter(Boolean);
    if (names.length) {
      const userDocs = await users.find({ username: { $in: names } }).project({ username: 1, avatarUrl: 1, _id: 0 }).toArray();
      const map = new Map(userDocs.map(u => [String(u.username).toLowerCase(), u.avatarUrl]));
  const { publicBase } = require('./utils/base');
  const base = publicBase();
      return baseRoster.map(r => {
        const rel = map.get(r.username.toLowerCase());
        return { ...r, avatarUrl: rel ? `${base}${rel}` : undefined };
      });
    }
  } catch (e) {
    logger.warn('buildRosterWithAvatars failed', e);
  }
  return baseRoster;
}

module.exports = { initSockets };
