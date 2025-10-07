// ID generation utilities.
// Provides a short, collision-resistant (for low volume) ID suitable for messages & filenames.
// Format: <epochMs-base36>-<randBase36>

function shortId() {
  const epoch = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8); // 6 chars ~ 36^6 ≈ 2.1B combinations
  return `${epoch}-${rand}`;
}

module.exports = { shortId };
