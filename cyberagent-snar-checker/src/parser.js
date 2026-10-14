const { config } = require('./config');

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 「満　席」のように全角スペースが入るため、判定用には空白をすべて除く
function compact(text) {
  return String(text || '').replace(/\s+/g, '');  // \s は全角スペース(U+3000)も含む
}

function includesAny(text, words) {
  return words.some(w => text.includes(w));
}

function isOpenSlot(slot) {
  const status = compact(slot.status);
  if (includesAny(status, config.closedStatuses)) return false;
  if (includesAny(status, config.openStatusKeywords)) return true;
  // 予約リンク（a.accept）に文字が入っている枠は、未知の文言でも予約できるとみなす
  return config.notifyUnknownOpenStatus && Boolean(compact(slot.linkText));
}

/**
 * 予約画面（mypage/seminar.aspx）の日程表から枠を抽出する。実画面の構造:
 *   <table id="grv_EventList" class="seminarDatalist">
 *     <tr><th>開催日</th><th>開始時間</th><th>会場名</th><th>予約状況</th></tr>
 *     <tr>
 *       <td><span class="pcOnly">2026年</span>10月6日(火)</td>
 *       <td>15:00</td>
 *       <td class="place">ZoomURL…</td>
 *       <td class="btn"><a class="accept">予約受付中</a><span class="over"></span></td>   ← 空き
 *       <td class="btn"><a class="accept"></a><span class="over">満　席</span></td>       ← 満席
 *     </tr>
 */
async function extractSlotsFromPage(page, program, pageNo = 1) {
  const raw = await page.$$eval('#grv_EventList tr', rows => {
    function text(el) {
      return el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }
    return rows
      .map(tr => Array.from(tr.querySelectorAll('td')))
      .filter(tds => tds.length >= 4)
      .map(tds => {
        const statusCell = tds[3];
        const link = statusCell.querySelector('a');
        return {
          day: text(tds[0]),
          time: text(tds[1]),
          place: text(tds[2]),
          linkText: text(link),
          // 自動予約でこの行の「予約受付中」を押すために、リンクのid（grv_EventList_lkb_Status_<行>）を控える
          linkId: link ? link.id : '',
          status: text(statusCell)
        };
      });
  });

  return raw.map(r => {
    const slot = {
      program: program.menuText,
      eventTitle: normalizeText(program.title),
      day: normalizeText(r.day),
      time: normalizeText(r.time),
      place: normalizeText(r.place),
      status: normalizeText(r.status),
      linkText: normalizeText(r.linkText),
      linkId: r.linkId,
      pageNo,
      url: program.url || ''
    };
    slot.key = [slot.program, slot.eventTitle, slot.day, slot.time, slot.place].join('|');
    return slot;
  });
}

module.exports = { extractSlotsFromPage, isOpenSlot, normalizeText };
