// Express app and middleware
const express = require('express');
const cors = require('cors');
const http = require('http');
const { connectMongo } = require('./db/mongo');
const { seedIfEmpty } = require('./db/seed');
const { initSockets } = require('./sockets');

const app = express();
app.use(cors());
app.use(express.json());

// Simple ping route for low-overhead connectivity tests
app.get('/ping', (_req, res) => res.type('text').send('pong'));

// Periodic debug to confirm process remains alive (can be removed later)
setInterval(() => {
	if (process.env.DEBUG_HEARTBEAT) {
		console.log('[heartbeat]', Math.round(process.uptime()), 's');
	}
}, 15000);

// Mount modular routers (they will lazy-load Mongo collections)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api', require('./routes/requests')); // contains /requests and /groups/:gid/requests
app.use('/api/messages', require('./routes/messages'));

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

async function start() {
	try {
		const cols = await connectMongo();
		await seedIfEmpty(cols);
				const basePort = parseInt(process.env.PORT, 10) || 3000;
				const maxAttempts = 5;

				function attempt(port, attemptNo) {
					const srv = http.createServer(app);
					initSockets(srv);
					console.log(`[startup] attempting listen on ${port} (attempt ${attemptNo})`);
					srv.once('error', (err) => {
						if (err.code === 'EADDRINUSE' && attemptNo < maxAttempts) {
							const nextPort = port + 1;
								console.warn(`Port ${port} in use, trying ${nextPort} (attempt ${attemptNo + 1}/${maxAttempts})`);
							attempt(nextPort, attemptNo + 1);
						} else {
							console.error('Server listen error', err);
							process.exit(1);
						}
					});
					srv.listen(port, () => console.log(`Server running at http://localhost:${port}`));
				}

				attempt(basePort, 1);
	} catch (err) {
		console.error('Startup failure', err);
		process.exit(1);
	}
}

start();
