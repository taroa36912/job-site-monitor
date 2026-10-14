const { execFileSync } = require('child_process');
const { config } = require('./config');
const { log, error } = require('./logger');

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatForPmset(date) {
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const year = String(date.getFullYear()).slice(-2);
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${month}/${day}/${year} ${hour}:${minute}:${second}`;
}

function scheduleNextWake() {
  const next = new Date(Date.now() + config.checkIntervalMinutes * 60 * 1000);
  const formatted = formatForPmset(next);

  try {
    execFileSync('pmset', ['schedule', 'wakeorpoweron', formatted], { stdio: 'pipe' });
    log(`[wake] next wake scheduled at ${formatted}`);
  } catch (e) {
    error('[wake] failed to schedule next wake. You may need to run once from Terminal and allow permissions.', e.message);
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
    error('[wake] failed to sleep', e.message);
  }
}

module.exports = { scheduleNextWake, sleepNowIfEnabled };
