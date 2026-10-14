const { config } = require('./config');

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text, words) {
  return words.some(w => text.includes(w));
}

function buildSlot(raw, program) {
  const slot = {
    program: program.keyword,
    eventTitle: normalizeText(program.title),
    day: normalizeText(raw.day),
    time: normalizeText(raw.time),
    place: normalizeText(raw.place),
    status: normalizeText(raw.status),
    disabled: Boolean(raw.disabled),
    rawText: normalizeText(raw.rawText),
    url: program.url || ''
  };
  slot.key = [slot.program, slot.eventTitle, slot.day, slot.time, slot.place].join('|');
  return slot;
}

function isOpenSlot(slot) {
  const status = normalizeText(slot.status);
  // 受付終了などの枠はラジオボタン自体が無い（disabled=true として扱う）
  if (slot.disabled) return false;
  if (includesAny(status, config.closedStatuses)) return false;
  if (includesAny(status, config.openStatusKeywords)) return true;
  return config.notifyUnknownOpenStatus;
}

/**
 * 日程選択画面（form/<番号>/select）から枠を抽出する。実画面の構造:
 *   <form name="form1" action="form/<番号>/yoyaku"><fieldset>
 *     <label class="reserve__item">
 *       <input type="radio" name="yoyaku_id" value="...">   ← 受付中の枠のみ（受付終了は <span class="disabled__mark">-</span>）
 *       <span class="item__recep open">受付中</span>         ← 受付終了は class="item__recep close"
 *       <span class="item__name"><b>WEB</b></span>
 *       <div class="item__date"><span class="day">2026年 10月 14日(水)</span><span class="time">17:00～18:30</span></div>
 *     </label>
 */
async function extractSlotsFromPage(page, program) {
  const raw = await page.$$eval('label.reserve__item, .reserve__item', items => {
    function text(el) {
      return el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    return items.map(item => {
      const input = item.querySelector('input[type="radio"], input[type="checkbox"]');
      return {
        day: text(item.querySelector('.day')),
        time: text(item.querySelector('.time')),
        place: text(item.querySelector('.item__name')),
        status: text(item.querySelector('.item__recep')),
        disabled: !input || input.disabled,
        // 「次回の案内を希望」など日程ではない選択肢（value=next_…）を除外するため
        inputValue: input ? input.value : '',
        rawText: text(item)
      };
    });
  });

  return raw
    .filter(r => !/^next/.test(r.inputValue))
    .map(r => buildSlot(r, program))
    .filter(slot => slot.day || slot.time);
}

module.exports = { extractSlotsFromPage, isOpenSlot, normalizeText };
