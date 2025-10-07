// Simple logger utility with level gating via LOG_LEVEL (debug,info,warn,error)
const levels = ['debug','info','warn','error'];
const current = process.env.LOG_LEVEL || 'debug';
const currentIdx = levels.indexOf(current);
function ts(){ return new Date().toISOString(); }
function log(level, msg, meta){
  if (levels.indexOf(level) < currentIdx) return;
  if (meta && typeof meta === 'object') {
    // Avoid circular structures
    try { console[level](`[${ts()}] ${level.toUpperCase()} ${msg}`, meta); } catch { console[level](`[${ts()}] ${level.toUpperCase()} ${msg}`); }
  } else {
    console[level](`[${ts()}] ${level.toUpperCase()} ${msg}`);
  }
}
module.exports = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta)
};