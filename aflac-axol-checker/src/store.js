const fs = require('fs');
const path = require('path');
const { config } = require('./config');

function ensureStore() {
  const dir = path.dirname(config.notifiedStorePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(config.notifiedStorePath)) {
    fs.writeFileSync(config.notifiedStorePath, JSON.stringify([], null, 2));
  }
}

function loadNotifiedSlots() {
  ensureStore();
  const text = fs.readFileSync(config.notifiedStorePath, 'utf8');
  try {
    const parsed = JSON.parse(text || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function loadNotifiedKeys() {
  return new Set(loadNotifiedSlots().map(item => item.key));
}

function appendNotifiedSlots(slots) {
  ensureStore();
  const current = loadNotifiedSlots();
  const now = new Date().toISOString();
  const next = current.concat(slots.map(slot => ({ ...slot, notifiedAt: now })));
  fs.writeFileSync(config.notifiedStorePath, JSON.stringify(next, null, 2));
}

module.exports = { loadNotifiedKeys, appendNotifiedSlots };
