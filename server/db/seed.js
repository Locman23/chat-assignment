const { makeId, makeGid, makeCid } = require('./mongo');

async function seedIfEmpty({ users, groups }) {
  const userCount = await users.countDocuments();
  const groupCount = await groups.countDocuments();

  if (userCount === 0) {
    await users.insertOne({
      _legacy: true,
      id: 'u1',
      username: 'super',
      email: 'super@example.com',
      password: '123',
      roles: ['Super Admin'],
      groups: []
    });
  }

  if (groupCount === 0) {
    const gid = makeGid();
    const cid = makeCid();
    await groups.insertOne({
      id: gid,
      name: 'General',
      ownerUsername: 'super',
      admins: ['super'],
      members: ['super'],
      channels: [{ id: cid, name: 'general' }]
    });
    await users.updateOne({ username: 'super' }, { $addToSet: { groups: gid } });
  }
}

module.exports = { seedIfEmpty };
