// Express app and middleware
const express = require('express');
const cors = require('cors');
const http = require('http');

const { loadData } = require('./dataStore');
const { initSockets } = require('./sockets');

const app = express();
app.use(cors());
app.use(express.json());

// Load persisted data at startup
loadData();

// Mount modular routers
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api', require('./routes/requests')); // contains /requests and /groups/:gid/requests

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Start server with HTTP wrapper (required for Socket.IO)
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
initSockets(server);
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
