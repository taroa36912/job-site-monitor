const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${timestamp()}]`, ...args);
}

function error(...args) {
  console.error(`[${timestamp()}]`, ...args);
}

function saveText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text || '', 'utf8');
}

module.exports = { log, error, ensureDir, saveText };
