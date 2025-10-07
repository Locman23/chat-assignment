const { getCollections, normalize } = require('../db/mongo');

async function getUserByUsername(username) {
  if (!username) return null;
  const { users } = getCollections();
  return users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
}

async function getGroupById(id) {
  if (!id) return null;
  const { groups } = getCollections();
  return groups.findOne({ id });
}

function isSuper(user) {
  return !!user && (user.roles || []).includes('Super Admin');
}

async function canAccessGroup(username, groupId) {
  const g = await getGroupById(groupId);
  if (!g) return false;
  const u = await getUserByUsername(username);
  if (!u) return false;
  if (isSuper(u)) return true;
  return (g.members || []).map(normalize).includes(normalize(username));
}

module.exports = { getUserByUsername, getGroupById, isSuper, canAccessGroup };
