// Lightweight structured logger with level gating via LOG_LEVEL (debug,info,warn,error)
// Retains console-based output; can be swapped for pino/winston later without API break.

const levels = ['debug','info','warn','error'];
const current = (process.env.LOG_LEVEL || 'debug').toLowerCase();
const currentIdx = Math.max(0, levels.indexOf(current));

function ts(){ return new Date().toISOString(); }

function safeMeta(meta) {
  if (!meta || typeof meta !== 'object') return undefined;
  try {
    // Shallow clone to avoid mutating original and strip large buffers
    const clone = Array.isArray(meta) ? meta.slice() : { ...meta };
    return clone;
  } catch {
    return undefined;
  }
}

function log(level, msg, meta){
  if (levels.indexOf(level) < currentIdx) return;
  const base = `[${ts()}] ${level.toUpperCase()} ${msg}`;
  const m = safeMeta(meta);
  if (m) {
    try { console[level](base, m); } catch { console[level](base); }
  } else {
    console[level](base);
  }
}

function child(bindings = {}) {
  // Produce a namespaced logger that merges provided bindings into meta.
  const wrap = (level) => (msg, meta) => {
    const merged = meta && typeof meta === 'object' ? { ...bindings, ...meta } : bindings;
    log(level, msg, merged);
  };
  return {
    debug: wrap('debug'),
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    child: (more) => child({ ...bindings, ...more })
  };
}

module.exports = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
  child
};