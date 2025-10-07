const { getCollections, normalize } = require('../db/mongo');

// NOTE: These helpers are intentionally light; caching is avoided to reduce staleness
// in real-time contexts (e.g. membership changes reflected immediately for sockets).

/**
 * Retrieve a user document by username (case-insensitive, normalized).
 * @param {string} username
 * @returns {Promise<object|null>} user doc or null
 */
async function getUserByUsername(username) {
  if (!username) return null;
  const { users } = getCollections();
  return users.findOne({ username: { $regex: `^${normalize(username)}$`, $options: 'i' } });
}

/**
 * Fetch group by its id (stored as id property, not _id).
 * @param {string|number} id
 * @returns {Promise<object|null>}
 */
async function getGroupById(id) {
  if (id === undefined || id === null) return null;
  const { groups } = getCollections();
  return groups.findOne({ id });
}

/**
 * Determine if a user has Super Admin role.
 * @param {object} user
 * @returns {boolean}
 */
function isSuper(user) {
  return !!user && (user.roles || []).includes('Super Admin');
}

/**
 * Check if username is a member of the provided group document.
 * @param {object} group
 * @param {string} username
 * @returns {boolean}
 */
function isGroupMember(group, username) {
  if (!group || !username) return false;
  return (group.members || []).map(normalize).includes(normalize(username));
}

/**
 * Determine whether a user (by username) can access a group (membership or super admin).
 * @param {string} username
 * @param {string|number} groupId
 * @returns {Promise<boolean>}
 */
async function canAccessGroup(username, groupId) {
  const g = await getGroupById(groupId);
  if (!g) return false;
  const u = await getUserByUsername(username);
  if (!u) return false;
  if (isSuper(u)) return true;
  return isGroupMember(g, username);
}

module.exports = { getUserByUsername, getGroupById, isSuper, canAccessGroup, isGroupMember };
