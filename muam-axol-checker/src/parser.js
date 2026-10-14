const { config } = require('./config');

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSlot({ day, time, place, status, title, eventKey, eventLabel, selectPath }) {
  const d = normalizeText(day);
  const t = normalizeText(time);
  const p = normalizeText(place);
  const s = normalizeText(status);
  const e = normalizeText(title || config.targetEventTitle);
  const keyPrefix = normalizeText(eventKey || eventLabel || e);
  const url = selectPath ? new URL(selectPath, config.baseUrl).toString() : '';
  return {
    key: [keyPrefix, e, d, t, p].join('|'),
    eventKey: eventKey || '',
    eventLabel: eventLabel || '',
    eventTitle: e,
    day: d,
    time: t,
    place: p,
    status: s,
    selectPath: selectPath || '',
    url
  };
}

function isOpenSlot(slot) {
  const status = normalizeText(slot.status);
  if (!status) return false;

  const isClosed = config.closedStatuses.some(closed => status.includes(closed));
  if (isClosed) return false;

  const isClearlyOpen = config.openStatusKeywords.some(open => status.includes(open));
  if (isClearlyOpen) return true;

  return config.notifyUnknownOpenStatus;
}

async function extractSlotsFromPage(page, eventConfig = {}) {
  const raw = await page.$$eval('label.reserve__item', (items) => {
    function text(el) {
      return el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    return items.map(item => ({
      status: text(item.querySelector('.item__recep')),
      place: text(item.querySelector('.item__name')),
      day: text(item.querySelector('.day')),
      time: text(item.querySelector('.time')),
      title: text(document.querySelector('legend b')) || text(document.querySelector('#contents__title'))
    }));
  });

  return raw
    .map(slot => buildSlot({
      ...slot,
      title: slot.title || eventConfig.title,
      eventKey: eventConfig.key,
      eventLabel: eventConfig.label,
      selectPath: eventConfig.selectPath
    }))
    .filter(slot => slot.day || slot.time || slot.status || slot.place);
}

module.exports = { extractSlotsFromPage, isOpenSlot, normalizeText };
