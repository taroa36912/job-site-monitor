const { chromium } = require('playwright');
const { config } = require('./config');
const { extractAllSlots, isOpenSlot, isReservedSlot } = require('./parser');
const { login, listMenuLinks, openSchedulePage } = require('./navigator');
const { loadNotifiedKeys, appendNotifiedSlots, pruneNotifiedSlots } = require('./store');
const { sendDiscordNotification, sendDiscordDebugNotification } = require('./discord');
const { scheduleNextWake, sleepNowIfEnabled } = require('./wake');
const { ensureDirs, log, warn, error, saveDebug } = require('./logger');

/**
 * 「選考予約」メニューの各ページを開き、対象の選考会の枠を集める。
 * 戻り値: 対象文字列ごとの { program, slots, openSlots, reserved?, error? }
 */
async function collectResults(page) {
  const links = await listMenuLinks(page);
  log(`[main] 選考予約 menu links: ${links.map(l => l.text).join(' / ') || '(なし)'}`);

  const found = new Map(); // targetText -> result
  for (const link of links) {
    await openSchedulePage(page, link);
    const all = await extractAllSlots(page);
    if (!all.length) continue;
    await saveDebug(page, 'schedule_page');

    for (const targetText of config.targetEventTexts) {
      const slots = all.filter(s => s.eventTitle.includes(targetText)).map(s => ({ ...s, program: targetText }));
      if (!slots.length || found.has(targetText)) continue;
      found.set(targetText, {
        program: { targetText, title: slots[0].eventTitle, menuText: link.text },
        slots,
        openSlots: slots.filter(isOpenSlot),
        reserved: slots.some(isReservedSlot)
      });
    }
  }

  return config.targetEventTexts.map(targetText => found.get(targetText) || {
    program: { targetText, title: targetText },
    slots: [],
    openSlots: [],
    error: '「選考予約」メニューのページに該当する選考会が見つかりません'
  });
}

async function main() {
  ensureDirs();
  log('==================================================');
  log(`[main] started. targets=${config.targetEventTexts.join(',')}, headless=${config.headless}`);

  scheduleNextWake();

  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  // 「正しい方法で表示されていません」などのダイアログが出ても操作しない
  page.on('dialog', dialog => {
    warn(`[dialog] dismiss: ${dialog.message().replace(/\s+/g, ' ')}`);
    dialog.dismiss().catch(() => null);
  });

  try {
    await login(page);
    await saveDebug(page, 'after_login');

    let results;
    try {
      results = await collectResults(page);
    } catch (e) {
      warn(`[check] failed: ${e.message}`);
      await saveDebug(page, 'check_failed');
      results = config.targetEventTexts.map(targetText => ({
        program: { targetText, title: targetText }, slots: [], openSlots: [], error: e.message, failed: true
      }));
    }

    for (const r of results) {
      const state = r.error ? `確認不可 (${r.error})` : r.reserved ? `予約中の日程あり（全${r.slots.length}件）` : `予約可能 ${r.openSlots.length}件 / 全${r.slots.length}件`;
      log(`[main] "${r.program.title}": ${state}`);
      if (r.slots.length) log(`[check] slots: ${JSON.stringify(r.slots, null, 2)}`);
    }

    if (config.alwaysNotifyDiscord) {
      await sendDiscordDebugNotification(results, 'ALWAYS_NOTIFY_DISCORD=true のため、予約可否に関係なく通知しています。');
      log('[main] debug discord notification sent');
    }

    // 一度通知した枠でも、満席などで予約不可に戻ったら記録から外し、再び空いたときに再通知する
    // （確認中にエラーになった対象の記録は判断できないので残す）
    const failed = results.filter(r => r.failed);
    pruneNotifiedSlots(
      slot => !failed.some(r => r.program.targetText === slot.program),
      new Set(results.flatMap(r => r.openSlots.map(slot => slot.key)))
    );

    // すでに予約中の選考会は通知しない
    const reservable = results.filter(r => r.openSlots.length && !r.reserved);
    if (!reservable.length) {
      log('[main] no reservable slots');
      return;
    }

    const notifiedKeys = loadNotifiedKeys();
    const newSlots = reservable.flatMap(r => r.openSlots).filter(slot => !notifiedKeys.has(slot.key));
    if (!newSlots.length) {
      log('[main] reservable slots found, but all already notified');
      return;
    }

    const newKeys = new Set(newSlots.map(slot => slot.key));
    // 新しい枠が出た選考会については、既通知分も含めた予約可能日程の一覧を通知する
    const toNotify = reservable.filter(r => r.openSlots.some(slot => newKeys.has(slot.key)));
    log(`[main] new reservable slots: ${newSlots.length}`);
    await sendDiscordNotification(toNotify, newKeys);
    appendNotifiedSlots(newSlots);
    log('[main] discord notified and store updated');
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
    sleepNowIfEnabled();
    log('[main] finished');
  }
}

main().catch(e => {
  error('[main] failed', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
