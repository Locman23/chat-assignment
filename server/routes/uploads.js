const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getCollections, normalize } = require('../db/mongo');
const { canAccessGroup } = require('../utils/access');
const asyncHandler = require('../utils/asyncHandler');

// Ensure uploads dir exists
const uploadRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

// Storage config: keep original ext, random filename
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    cb(null, name);
  }
});

const IMAGE_MIME = new Set(['image/png','image/jpeg','image/gif','image/webp']);
function fileFilter(_req, file, cb){
  if (!IMAGE_MIME.has(file.mimetype)) return cb(new Error('invalid file type'));
  cb(null, true);
}

const { UPLOAD_MAX_FILE_SIZE_BYTES } = require('../constants');
const upload = multer({ storage, fileFilter, limits: { fileSize: UPLOAD_MAX_FILE_SIZE_BYTES } }); // 2MB limit

const router = express.Router();

// POST /api/uploads/avatar  (multipart field: avatar, body: username=requester)
router.post('/avatar', upload.single('avatar'), asyncHandler(async (req, res) => {
  const requester = req.body?.requester;
  if (!requester) return res.status(400).json({ error: 'requester required' });
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const { users } = getCollections();
  const user = await users.findOne({ username: { $regex: `^${normalize(requester)}$`, $options: 'i' } });
  if (!user) return res.status(404).json({ error: 'user not found' });
  const relative = `/uploads/${req.file.filename}`;
  const { publicBase } = require('../utils/base');
  const base = publicBase();
  const absolute = `${base}${relative}`;
  await users.updateOne({ id: user.id }, { $set: { avatarUrl: relative } }); // store relative in DB
  const updated = await users.findOne({ id: user.id }, { projection: { _id: 0 } });
  res.json({ ok: true, user: updated, avatarUrl: absolute });
}));

// POST /api/uploads/message-image  (multipart field: image, body: { username, groupId, channelId })
// Only validates group membership; actual message send still via socket referencing returned url.
router.post('/message-image', upload.single('image'), asyncHandler(async (req, res) => {
  const { username, groupId, channelId } = req.body || {};
  if (!username || !groupId || !channelId) return res.status(400).json({ error: 'username, groupId, channelId required' });
  if (!(await canAccessGroup(username, groupId))) return res.status(403).json({ error: 'not authorized' });
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const relative = `/uploads/${req.file.filename}`;
  const { publicBase } = require('../utils/base');
  const base = publicBase();
  res.json({ ok: true, url: `${base}${relative}` });
}));

module.exports = router;