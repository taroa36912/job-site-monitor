const { config } = require('./config');

function normalizeText(text) {
  return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function includesAny(text, words) {
  const t = normalizeText(text);
  return words.some(w => t.includes(w));
}

function isOpenSlot(slot) {
  const status = normalizeText(slot.status);
  const rowText = normalizeText(slot.rawText || '');
  const combined = `${status} ${rowText}`;

  if (includesAny(combined, config.closedStatuses)) return false;
  if (slot.enabledControl) return true;
  if (includesAny(combined, config.openStatusKeywords)) return true;

  return config.notifyUnknownOpenStatus && Boolean(slot.date || slot.time || status);
}

function makeKey(slot) {
  return [slot.date, slot.time, slot.place, slot.status].map(normalizeText).join('|');
}

async function extractSlotsFromPage(page) {
  const rawSlots = await page.evaluate(() => {
    function text(el) {
      return el && el.innerText ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    }

    function attr(el, name) {
      return el ? (el.getAttribute(name) || '') : '';
    }

    function clean(s) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function dateFromText(s) {
      const patterns = [
        /20\d{2}[\/年]\s*\d{1,2}[\/月]\s*\d{1,2}日?\s*(?:\([^)]+\))?/,
        /\d{1,2}[\/月]\s*\d{1,2}日?\s*(?:\([^)]+\))?/
      ];
      for (const p of patterns) {
        const m = clean(s).match(p);
        if (m) return clean(m[0]);
      }
      return '';
    }

    function timeFromText(s) {
      const m = clean(s).match(/\d{1,2}:\d{2}\s*(?:[〜～\-]\s*\d{1,2}:\d{2})?/);
      return m ? clean(m[0]) : '';
    }

    function statusFromText(s) {
      const candidates = [
        '満席', '受付終了', '受付締切', '申込終了', '予約終了', '予約受付終了',
        '定員に達しました', '締切', '受付中', '申込受付中', '予約受付中',
        '予約可', '申込可', '空席', '空き', '残席', '予約可能', '申込可能', '予約する'
      ];
      const t = clean(s);
      return candidates.find(c => t.includes(c)) || '';
    }

    const slots = [];
    const seen = new Set();

    function addSlot(base) {
      const rawText = clean(base.rawText || '');
      const date = clean(base.date || dateFromText(rawText));
      const time = clean(base.time || timeFromText(rawText));
      const status = clean(base.status || statusFromText(rawText));
      const place = clean(base.place || '');
      const enabledControl = Boolean(base.enabledControl);
      const key = [date, time, place, status, enabledControl, rawText.slice(0, 80)].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      slots.push({ date, time, place, status, enabledControl, rawText });
    }

    // Primary: selectable controls on day-select page.
    const controls = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
    for (const control of controls) {
      const type = attr(control, 'type').toLowerCase();
      const name = attr(control, 'name').toLowerCase();
      const id = attr(control, 'id').toLowerCase();
      const value = attr(control, 'value');
      const likelySlotControl = type === 'radio' || name.includes('event') || name.includes('day') || name.includes('yoyaku') || id.includes('event') || id.includes('day');
      if (!likelySlotControl) continue;
      const row = control.closest('tr, label, li, .eventday, .event_day, .day, .contents_bdr_wrap, .floatmap, div') || control.parentElement;
      addSlot({
        rawText: text(row),
        enabledControl: !control.disabled && control.offsetParent !== null,
        status: control.disabled ? '選択不可' : '',
        date: dateFromText(text(row)),
        time: timeFromText(text(row)),
        place: ''
      });
    }

    // Secondary: table/list rows with explicit statuses.
    const rowCandidates = Array.from(document.querySelectorAll('tr, label, li, .contents_bdr_wrap, .floatmap'));
    for (const row of rowCandidates) {
      const t = text(row);
      if (!t) continue;
      const hasDateOrTime = /20\d{2}[\/年]|\d{1,2}[\/月]\s*\d{1,2}|\d{1,2}:\d{2}/.test(t);
      const hasStatus = /(満席|受付終了|受付締切|申込終了|予約終了|受付中|申込受付中|予約受付中|空席|残席|予約可能|申込可能)/.test(t);
      if (!hasDateOrTime && !hasStatus) continue;
      addSlot({ rawText: t, status: statusFromText(t), date: dateFromText(t), time: timeFromText(t) });
    }

    return slots;
  });

  return rawSlots.map(slot => {
    const normalized = {
      date: normalizeText(slot.date),
      time: normalizeText(slot.time),
      place: normalizeText(slot.place),
      status: normalizeText(slot.status),
      enabledControl: Boolean(slot.enabledControl),
      rawText: normalizeText(slot.rawText)
    };
    return { ...normalized, key: makeKey(normalized) };
  });
}

module.exports = { extractSlotsFromPage, isOpenSlot };
