// Single place to resolve the public base URL for constructing absolute links.
// Falls back to localhost:3000 when PUBLIC_BASE is unset.
// Memoized to avoid repeated env parsing.

let _cached;
/**
 * Obtain absolute public base URL prefix (no trailing slash stripped externally).
 * @returns {string}
 */
function publicBase() {
  if (_cached) return _cached;
  _cached = process.env.PUBLIC_BASE || 'http://localhost:3000';
  // Normalize: remove trailing slash for consistent concatenation
  if (_cached.endsWith('/')) _cached = _cached.slice(0, -1);
  return _cached;
}

module.exports = { publicBase };