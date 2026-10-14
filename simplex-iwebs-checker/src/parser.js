const { config } = require('./config');

function normalizeText(text) {
  return String(text || '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOpenSlot(slot) {
  if (!slot.eventDayNo) return false;
  return !config.closedStatuses.some(t => slot.status.replace(/\s+/g, '').includes(t));
}

/**
 * 日程選択画面（applicant/event/day-select/）から枠を抽出する。実画面の構造:
 *   <table class="scheduletable">
 *     <tr><th>予約状況<form name="form2" action="…/event/confirm/">…eventdayno…</form></th><th>開催日</th><th>開催時間</th><th>会場名</th></tr>
 *     <tr><td class="detail"><span class="soldout">満席</span></td><td>2026/10/07(水)</td><td>10:00</td><td>オンライン</td></tr>     ← 満席
 *     <tr><td class="detail"><input type="button" value="予約" onclick="JavaScript: jsSubmit('2816');"></td><td>2026/11/09(月)</td>…</tr> ← 空き
 *   jsSubmit(no) は form2 の eventdayno に no を入れて確認画面（event/confirm/）へ送信する。
 */
async function extractSlotsFromPage(page, program) {
  const raw = await page.$$eval('table.scheduletable tr', rows => {
    function text(el) {
      return el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }
    return rows
      .map(tr => Array.from(tr.querySelectorAll('td')))
      .filter(tds => tds.length >= 4)
      .map(tds => {
        const statusCell = tds[0];
        const button = statusCell.querySelector('input[type="button"], input[type="submit"], button');
        const onclick = button ? String(button.getAttribute('onclick') || '') : '';
        // jsSubmit('N') のみ予約。jsWaitingSubmit('N') はキャンセル待ちなので番号を取らない
        const m = onclick.match(/\bjsSubmit\(\s*'?(\d+)'?\s*\)/);
        return {
          // 空き枠は「予約」ボタンなので、通知では「空きあり」と表示する
          status: button ? (/jsWaitingSubmit/.test(onclick) ? 'キャンセル待ち' : '空きあり') : text(statusCell),
          eventDayNo: m ? m[1] : '',
          day: text(tds[1]),
          time: text(tds[2]),
          place: text(tds[3])
        };
      });
  });

  return raw.map(r => {
    const slot = {
      program: program.targetText,
      eventTitle: normalizeText(program.title),
      day: normalizeText(r.day),
      time: normalizeText(r.time),
      place: normalizeText(r.place),
      status: normalizeText(r.status),
      eventDayNo: r.eventDayNo
    };
    slot.key = [slot.program, slot.eventTitle, slot.day, slot.time, slot.place].join('|');
    return slot;
  });
}

module.exports = { extractSlotsFromPage, isOpenSlot, normalizeText };
