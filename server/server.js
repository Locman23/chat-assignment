// ---------------------------------------------------------------------------
// Core dependencies & initialization
// ---------------------------------------------------------------------------
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { connectMongo } = require('./db/mongo');
const { seedIfEmpty } = require('./db/seed');
const { initSockets } = require('./sockets');
const logger = require('./utils/logger');

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded files statically (basic; in production add auth & caching headers)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Simple ping route for low-overhead connectivity tests
app.get('/ping', (_req, res) => res.type('text').send('pong'));

// Periodic debug to confirm process remains alive 
if (process.env.DEBUG_HEARTBEAT) {
  setInterval(() => logger.debug('heartbeat', { uptimeSec: Math.round(process.uptime()) }), 15000);
}

// ---------------------------------------------------------------------------
// REST API routes
// ---------------------------------------------------------------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api', require('./routes/requests')); // contains /requests and /groups/:gid/requests
app.use('/api/messages', require('./routes/messages'));
app.use('/api/uploads', require('./routes/uploads'));

// Health check - will succeed once Mongo connected
app.get('/api/health', async (_req, res) => {
  try {
    const { getCollections } = require('./db/mongo');
    let stats = {};
    try {
      const { users, groups, joinRequests } = getCollections();
      const [userCount, groupCount, reqCount] = await Promise.all([
        users.countDocuments(),
        groups.countDocuments(),
        joinRequests.countDocuments()
      ]);
      stats = { userCount, groupCount, joinRequestCount: reqCount };
    } catch (inner) {
      stats = { error: 'collections not ready' };
    }
    res.json({ ok: true, uptimeSec: Math.round(process.uptime()), ...stats });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'health check failed' });
  }
});

// ---------------------------------------------------------------------------
// Startup lifecycle
// ---------------------------------------------------------------------------
async function start() {
  try {
    const cols = await connectMongo();
    await seedIfEmpty(cols);

    const basePort = parseInt(process.env.PORT, 10) || 3000;
    const maxAttempts = 5;

    function attempt(port, attemptNo) {
      const srv = http.createServer(app);
      initSockets(srv);
      logger.info(`Attempting listen on ${port} (attempt ${attemptNo})`);
      srv.once('error', err => {
        if (err.code === 'EADDRINUSE' && attemptNo < maxAttempts) {
          const nextPort = port + 1;
          logger.warn(`Port ${port} in use, trying ${nextPort} (attempt ${attemptNo + 1}/${maxAttempts})`);
          attempt(nextPort, attemptNo + 1);
        } else {
          logger.error('Server listen error', err);
          process.exit(1);
        }
      });
      srv.listen(port, () => logger.info(`Server running at http://localhost:${port}`));
    }

    attempt(basePort, 1);
  } catch (err) {
    logger.error('Startup failure', err);
    process.exit(1);
  }
}

start();
