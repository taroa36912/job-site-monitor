const { config } = require('./config');

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeKey(slot) {
  return [slot.programTitle, slot.day, slot.time, slot.place].map(normalizeText).join('|');
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

async function extractSlotsFromTargetPage(page) {
  const rawSlots = await page.$$eval('label.reserve__item, details.reserve__item, .reserve__item', (items, targetProgramTitle) => {
    function text(el) {
      return el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    return Array.from(items).map(item => {
      const status = text(item.querySelector('.item__recep'));
      const place = text(item.querySelector('.item__name'));
      const day = text(item.querySelector('.day, .item__day'));
      const time = text(item.querySelector('.time'));

      return {
        programTitle: targetProgramTitle,
        status,
        place,
        day,
        time
      };
    }).filter(slot => slot.status || slot.day || slot.time || slot.place);
  }, config.targetProgramTitle);

  return rawSlots.map(slot => {
    const normalized = {
      programTitle: normalizeText(slot.programTitle),
      status: normalizeText(slot.status),
      place: normalizeText(slot.place),
      day: normalizeText(slot.day),
      time: normalizeText(slot.time)
    };
    return { ...normalized, key: makeKey(normalized) };
  });
}

module.exports = { extractSlotsFromTargetPage, isOpenSlot, normalizeText };
