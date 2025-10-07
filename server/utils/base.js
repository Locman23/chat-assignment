// Single place to resolve the public base URL for constructing absolute links.
// Falls back to localhost:3000 when PUBLIC_BASE is unset.

function publicBase() {
  return process.env.PUBLIC_BASE || 'http://localhost:3000';
}

module.exports = { publicBase };