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

// Mount modular routers (they will lazy-load Mongo collections)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api', require('./routes/requests')); // contains /requests and /groups/:gid/requests

// Health check - will succeed once Mongo connected
app.get('/api/health', async (_req, res) => {
	try {
		res.json({ ok: true });
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
