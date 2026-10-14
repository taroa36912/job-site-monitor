const fs = require('fs');
const path = require('path');
const { config } = require('./config');

function resolveStorePath() {
  return path.resolve(process.cwd(), config.notifiedStorePath);
}

function ensureStore() {
  const storePath = resolveStorePath();
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, JSON.stringify([], null, 2));
  return storePath;
}

function loadNotifiedSlots() {
  const storePath = ensureStore();
  try {
    const text = fs.readFileSync(storePath, 'utf8');
    const items = JSON.parse(text || '[]');
    return Array.isArray(items) ? items : [];
  } catch (e) {
    const backup = `${storePath}.broken.${Date.now()}`;
    fs.copyFileSync(storePath, backup);
    fs.writeFileSync(storePath, JSON.stringify([], null, 2));
    return [];
  }
}

function loadNotifiedKeys() {
  return new Set(loadNotifiedSlots().map(item => item.key).filter(Boolean));
}

function appendNotifiedSlots(slots) {
  if (!slots.length) return;
  const storePath = ensureStore();
  const current = loadNotifiedSlots();
  const now = new Date().toISOString();
  const next = current.concat(slots.map(slot => ({ ...slot, notifiedAt: now })));
  fs.writeFileSync(storePath, JSON.stringify(next, null, 2));
}

module.exports = { loadNotifiedKeys, appendNotifiedSlots };
