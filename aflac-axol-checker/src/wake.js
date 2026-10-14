const { execFileSync } = require('child_process');
const { config } = require('./config');
const { log, error } = require('./logger');

function pad(n) { return String(n).padStart(2, '0'); }

function formatForPmset(date) {
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function scheduleNextWake() {
  const next = new Date(Date.now() + config.checkIntervalMinutes * 60 * 1000);
  const formatted = formatForPmset(next);
  try {
    execFileSync('pmset', ['schedule', 'wakeorpoweron', formatted], { stdio: 'pipe' });
    log(`[wake] next wake scheduled: ${formatted}`);
  } catch (e) {
    error('[wake] failed to schedule wake:', e.message);
  }
}

function sleepNowIfEnabled() {
  if (!config.autoSleep) {
    log('[wake] AUTO_SLEEP=false, skip sleep');
    return;
  }
  try {
    log('[wake] sleeping now');
    execFileSync('pmset', ['sleepnow'], { stdio: 'pipe' });
  } catch (e) {
    error('[wake] failed to sleep:', e.message);
  }
}

module.exports = { scheduleNextWake, sleepNowIfEnabled };
