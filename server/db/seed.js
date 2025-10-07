const { makeGid, makeCid } = require('./mongo');

/**
 * Seed database with a super user + default group if empty.
 * Password remains legacy plain text for now (replace with hashed bootstrap later).
 */
async function seedIfEmpty({ users, groups }) {
  const [userCount, groupCount] = await Promise.all([
    users.countDocuments(),
    groups.countDocuments()
  ]);

  if (userCount === 0) {
    await users.insertOne({ id: 'u1', username: 'super', email: 'super@example.com', password: '123', roles: ['Super Admin'], groups: [] });
  }

  if (groupCount === 0) {
    const gid = makeGid();
    const cid = makeCid();
    await groups.insertOne({ id: gid, name: 'General', ownerUsername: 'super', admins: ['super'], members: ['super'], channels: [{ id: cid, name: 'general' }] });
    await users.updateOne({ username: 'super' }, { $addToSet: { groups: gid } });
  }
}

module.exports = { seedIfEmpty };
