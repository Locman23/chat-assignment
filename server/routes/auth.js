const express = require('express');
const router = express.Router();
const { getCollections, normalize } = require('../db/mongo');
const asyncHandler = require('../utils/asyncHandler');

/*
Auth routes (minimal / temporary):
 - Single login endpoint with naive password validation (plain text + hard‑coded super user fallback).
 - Case-insensitive username match using normalize() + anchored regex to avoid duplicates.
 - Returns full user document so client can derive authorization for now.
Security TODO:
 - Hash + salt passwords (bcrypt / argon2).
 - Eliminate hard-coded super user credential.
 - Introduce token/session based auth & strip sensitive fields from response.
*/

// POST /api/auth/login -> authenticate with username/password (case-insensitive username)
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  const { users } = getCollections();
  const user = await users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
  if (!user) return res.status(401).json({ error: 'Invalid username/password' });
  // Legacy acceptance: stored plain password OR special super user override.
  const passOk = (user.password && user.password === password) || (user.username === 'super' && password === '123');
  if (!passOk) return res.status(401).json({ error: 'Invalid username/password' });
  // TODO: Remove password field from response when frontend updated to not depend on it.
  return res.json({ user });
}));

module.exports = router;
