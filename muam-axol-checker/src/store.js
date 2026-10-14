const fs = require('fs');
const path = require('path');
const { config } = require('./config');

function ensureStore() {
  fs.mkdirSync(path.dirname(config.notifiedStorePath), { recursive: true });
  if (!fs.existsSync(config.notifiedStorePath)) {
    fs.writeFileSync(config.notifiedStorePath, JSON.stringify([], null, 2));
  }
}

function loadNotifiedSlots() {
  ensureStore();
  try {
    const text = fs.readFileSync(config.notifiedStorePath, 'utf8');
    const items = JSON.parse(text || '[]');
    return Array.isArray(items) ? items : [];
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
