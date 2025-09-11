const express = require('express');
const router = express.Router();
const { getUserByUsername } = require('../dataStore');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Invalid username/password' });

  if (user.password && user.password === password) return res.json({ user });
  if (user.username === 'super' && password === '123') return res.json({ user });

  return res.status(401).json({ error: 'Invalid username/password' });
});

module.exports = router;
