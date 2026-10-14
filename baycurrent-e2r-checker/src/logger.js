const fs = require('fs');
const path = require('path');
const { config } = require('./config');

function ensureDirs() {
  fs.mkdirSync(config.logsDir, { recursive: true });
  fs.mkdirSync(config.debugDir, { recursive: true });
}

function log(message, obj) {
  const line = `[${new Date().toISOString()}] ${message}`;
  if (obj !== undefined) console.log(line, obj);
  else console.log(line);
}

function warn(message, obj) {
  const line = `[${new Date().toISOString()}] WARN ${message}`;
  if (obj !== undefined) console.warn(line, obj);
  else console.warn(line);
}

function error(message, obj) {
  const line = `[${new Date().toISOString()}] ERROR ${message}`;
  if (obj !== undefined) console.error(line, obj);
  else console.error(line);
}

async function saveDebug(page, label) {
  if (!config.saveDebug) return;
  ensureDirs();
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlPath = path.join(config.debugDir, `${ts}_${safe}.html`);
  const pngPath = path.join(config.debugDir, `${ts}_${safe}.png`);
  try {
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');
    await page.screenshot({ path: pngPath, fullPage: true });
    log(`[debug] saved ${htmlPath}`);
    log(`[debug] saved ${pngPath}`);
  } catch (e) {
    warn(`[debug] failed to save ${label}: ${e.message}`);
  }
}

module.exports = { ensureDirs, log, warn, error, saveDebug };
