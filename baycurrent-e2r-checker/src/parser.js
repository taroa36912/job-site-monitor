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

function isReservedSlot(slot) {
  return includesAny(slot.status, config.reservedStatusKeywords);
}

function isOpenSlot(slot) {
  if (isReservedSlot(slot)) return false;
  if (includesAny(slot.status, config.closedStatuses)) return false;
  // 「予約可」の表示、または［予約］［予約変更］ボタンがある枠を空きとみなす
  return includesAny(slot.status, config.openStatusKeywords) || /予約/.test(slot.buttonText);
}

/**
 * 日程ページ（メニュー「選考予約」の各リンク先）から、全選考会の枠を抽出する。実画面の構造:
 *   <div class="event">
 *     <h3>【秋冬本選考】東大・京大生限定選考会</h3>                       ← 選考会名
 *     <div class="schedule-title">2026/10/07(水)　オンライン</div>         ← 日付・形式
 *     <ul class="schedule-list"><li><div class="schedule">
 *       17:05〜18:00<div>予約可</div><input type="button" value="予約" onclick="on_Sub('260','2','','3','');">
 *     </div></li></ul>
 *     <div class="schedule-title">…</div><ul class="schedule-list">…</ul>
 *     <h3>次の選考会</h3> …
 *   </div>
 * 見出し・日付帯・枠が兄弟要素として順に並ぶので、文書順にたどって対応づける。
 */
async function extractAllSlots(page) {
  const raw = await page.evaluate(() => {
    function clean(s) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }
    const out = [];
    let eventTitle = '';
    let dateLine = '';
    const nodes = document.querySelectorAll('.event h3, .event .schedule-title, .event .schedule');
    for (const node of nodes) {
      if (node.matches('h3')) {
        eventTitle = clean(node.innerText);
        dateLine = '';
      } else if (node.matches('.schedule-title')) {
        dateLine = clean(node.innerText);
      } else {
        const button = node.querySelector('input[type="button"], input[type="submit"], button, a');
        const statusEl = node.querySelector('div');
        // 時間はボックス先頭のテキスト（例: 17:05〜18:00）
        const time = clean(Array.from(node.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
        out.push({
          eventTitle,
          dateLine,
          time,
          status: clean(statusEl ? statusEl.innerText : ''),
          buttonText: button ? clean(button.value || button.innerText) : ''
        });
      }
    }
    return out;
  });

  return raw.map(r => {
    // 「2026/10/07(水)　オンライン」→ 日付と会場/形式に分ける
    const dateLine = normalizeText(r.dateLine);
    const m = dateLine.match(/^(\S+)\s*(.*)$/);
    const slot = {
      eventTitle: normalizeText(r.eventTitle),
      day: m ? m[1] : dateLine,
      place: m ? m[2] : '',
      time: normalizeText(r.time),
      status: normalizeText(r.status),
      buttonText: normalizeText(r.buttonText)
    };
    slot.key = [slot.eventTitle, slot.day, slot.time, slot.place].join('|');
    return slot;
  });
}

module.exports = { extractAllSlots, isOpenSlot, isReservedSlot, normalizeText };
