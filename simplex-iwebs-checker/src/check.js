const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromPage, isOpenSlot } = require('./parser');
const { login, openTarget, bodyText } = require('./navigator');
const { loadNotifiedKeys, appendNotifiedSlots, pruneNotifiedSlots } = require('./store');
const { sendDiscordNotification, sendDiscordDebugNotification, sendReservationNotification } = require('./discord');
const {
  installDialogHandler,
  isAutoReserveTarget,
  alreadyReserved,
  failureAlreadyRecorded,
  recordAttempt,
  pickLastSlot,
  reserveSlot
} = require('./reserve');
const { scheduleNextWake, sleepNowIfEnabled } = require('./wake');
const { ensureDirs, log, warn, error, saveDebug } = require('./logger');

function emptyResult(targetText, title, extra) {
  return { program: { targetText, title }, slots: [], openSlots: [], ...extra };
}

async function checkTarget(page, targetText) {
  const opened = await openTarget(page, targetText);
  if (opened.state === 'not-found') {
    return emptyResult(targetText, targetText, { error: 'マイページトップに該当する項目（申込/確認ボタン）が見つかりません' });
  }
  if (opened.state === 'reserved') {
    log(`[check] "${opened.title}" は予約済みの画面でした`);
    return emptyResult(targetText, opened.title, { reserved: true });
  }
  if (opened.state !== 'day-select') {
    return emptyResult(targetText, opened.title, { error: `日程選択画面を開けませんでした（URL: ${page.url()}）`, failed: true });
  }

  const program = { targetText, title: opened.title };
  await saveDebug(page, 'day_select');

  const slots = await extractSlotsFromPage(page, program);
  const openSlots = slots.filter(isOpenSlot);
  if (!slots.length) {
    const body = await bodyText(page);
    const noDates = config.noDatesTexts.find(t => body.includes(t));
    log(`[check] "${opened.title}": ${noDates ? `「${noDates}」` : '日程表を読めませんでした'}`);
  }
  log(`[check] "${opened.title}" total slots: ${slots.length}, open: ${openSlots.length}`);
  log(`[check] slots: ${JSON.stringify(slots, null, 2)}`);
  return { program, slots, openSlots };
}

/** 空き枠がある自動予約対象について、一番最後の日程を予約する。通知すべき結果だけを返す。 */
async function autoReserve(page, reservable) {
  const notify = [];
  for (const r of reservable) {
    const targetText = r.program.targetText;
    if (!isAutoReserveTarget(targetText)) continue;
    if (alreadyReserved(targetText)) {
      log(`[reserve] "${r.program.title}" はこのツールで予約済みのためスキップ`);
      continue;
    }

    const slot = pickLastSlot(r.openSlots);
    let result;
    try {
      result = await reserveSlot(page, slot);
    } catch (e) {
      warn(`[reserve] failed: ${e.message}`);
      result = { status: 'failed', message: e.message };
    }
    log(`[reserve] result: ${result.status} - ${result.message}`);

    // 同じ枠の失敗は初回だけ通知する（再試行は毎回行う）
    const shouldNotify = result.status !== 'failed' || !failureAlreadyRecorded(slot);
    if (result.status !== 'dry-run') recordAttempt(slot, result);
    if (shouldNotify) notify.push({ program: r.program, slot, result });
  }
  return notify;
}

async function main() {
  ensureDirs();
  log('==================================================');
  log(`[main] started. targets=${config.targetTexts.join(',')}, autoReserve=${config.autoReserve}, dryRun=${config.autoReserveDryRun}, headless=${config.headless}`);

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
  // confirm ダイアログは基本キャンセル。自動予約の「予約申し込み」の確認だけ OK にする
  installDialogHandler(page);

  try {
    await login(page);
    await saveDebug(page, 'after_login');

    const results = [];
    for (const targetText of config.targetTexts) {
      try {
        results.push(await checkTarget(page, targetText));
      } catch (e) {
        warn(`[check] "${targetText}" failed: ${e.message}`);
        await saveDebug(page, 'check_failed');
        results.push(emptyResult(targetText, targetText, { error: e.message, failed: true }));
      }
    }

    for (const r of results) {
      const state = r.error ? `確認不可 (${r.error})` : r.reserved ? '予約済み' : `予約可能 ${r.openSlots.length}件 / 全${r.slots.length}件`;
      log(`[main] "${r.program.title}": ${state}`);
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

    const reservable = results.filter(r => r.openSlots.length);
    if (!reservable.length) {
      log('[main] no reservable slots');
      return;
    }

    // 自動予約（対象のみ）。枠はすぐ埋まるので通知より先に行う。
    const reservations = await autoReserve(page, reservable);
    if (reservations.length) {
      await sendReservationNotification(reservations);
      log('[main] reservation result notified');
    }

    const notifiedKeys = loadNotifiedKeys();
    const newSlots = reservable.flatMap(r => r.openSlots).filter(slot => !notifiedKeys.has(slot.key));
    if (!newSlots.length) {
      log('[main] reservable slots found, but all already notified');
      return;
    }

    const newKeys = new Set(newSlots.map(slot => slot.key));
    // 新しい枠が出た項目については、既通知分も含めた予約可能日程の一覧を通知する
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
