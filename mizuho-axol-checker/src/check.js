const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromPage, isOpenSlot } = require('./parser');
const { login, openFormList, extractEventItems, openEventItem, bodyText } = require('./navigator');
const { loadNotifiedKeys, appendNotifiedSlots, pruneNotifiedSlots } = require('./store');
const { sendDiscordNotification, sendDiscordDebugNotification } = require('./discord');
const { scheduleNextWake, sleepNowIfEnabled } = require('./wake');
const { ensureDirs, log, warn, error, saveDebug } = require('./logger');

function closedResult(program, reason, extra = {}) {
  return { program, reservable: false, reason, slots: [], openSlots: [], ...extra };
}

async function checkItem(page, keyword, item) {
  const program = { keyword, title: item.title, url: '' };

  if (item.reserved) {
    // 既に予約済み（「予約内容を確認する」ボタン）。予約不要なので通知しない。
    return closedResult(program, `予約済み（${item.info}）`);
  }
  if (!item.entryButton) {
    return closedResult(program, item.closedReason || '予約ボタンなし');
  }
  if (item.entryButton.disabled) {
    return closedResult(program, item.closedReason || `「${item.entryButton.text}」ボタンが無効`);
  }

  program.url = await openEventItem(page, item);
  await saveDebug(page, `${keyword}_select`);

  const slots = await extractSlotsFromPage(page, program);
  const openSlots = slots.filter(isOpenSlot);
  log(`[check:${keyword}] "${item.title}" total slots: ${slots.length}, open: ${openSlots.length}`);
  log(`[check:${keyword}] slots: ${JSON.stringify(slots, null, 2)}`);

  if (!slots.length) {
    const body = await bodyText(page);
    const reason = config.closedItemTexts.find(t => body.includes(t));
    if (reason) return closedResult(program, `日程画面に「${reason}」と表示`);

    // ボタンは押せたが日程を読めない → 見逃し防止のため予約可能扱いで通知する
    warn(`[check:${keyword}] entry button is enabled but no slots were parsed.`);
    await saveDebug(page, `${keyword}_no_slots_parsed`);
    const placeholder = { key: `${keyword}|${item.title}|__entry_open__`, program: keyword, eventTitle: item.title, day: '', time: '', place: '', status: '日程解析不可', rawText: '' };
    return { program, reservable: true, slots: [], openSlots: [placeholder] };
  }

  if (!openSlots.length) return { ...closedResult(program, '全日程が満席/受付終了'), slots };
  return { program, reservable: true, slots, openSlots };
}

async function main() {
  ensureDirs();
  log('==================================================');
  log(`[main] started. targets=${config.targetKeywords.join(',')}, headless=${config.headless}`);

  scheduleNextWake();

  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await login(page);
    await openFormList(page);
    await saveDebug(page, 'form_list');

    const items = await extractEventItems(page);
    log(`[main] form list items: ${items.length}`);
    for (const item of items) {
      log(`[main]  #${item.index} ${item.title} | button=${item.entryButton ? `${item.entryButton.text}${item.entryButton.disabled ? '(disabled)' : ''}` : 'none'}${item.reserved ? ' | 予約済' : ''}${item.closedReason ? ` | ${item.closedReason}` : ''}`);
    }

    const results = [];
    for (const keyword of config.targetKeywords) {
      // タイトル一致を優先し、無ければ項目本文で探す（他イベントの説明文中の言及を拾わないため）
      const titleMatches = items.filter(item => item.title.includes(keyword));
      const matches = titleMatches.length ? titleMatches : items.filter(item => item.text.includes(keyword));
      if (!matches.length) {
        log(`[check:${keyword}] not found on form list`);
        results.push(closedResult({ keyword, title: '（予約一覧に該当項目なし）', url: '' }, '予約一覧に項目なし'));
        continue;
      }

      for (const item of matches) {
        try {
          results.push(await checkItem(page, keyword, item));
        } catch (e) {
          warn(`[check:${keyword}] "${item.title}" failed: ${e.message}`);
          await saveDebug(page, `${keyword}_failed`);
          results.push(closedResult({ keyword, title: item.title, url: page.url() }, `確認中にエラー: ${e.message}`, { failed: true }));
        }
        // 次の項目のために予約一覧へ戻る
        if (!/\/mypage\/form(?:$|[?#])/.test(page.url())) await openFormList(page);
      }
    }

    for (const r of results) {
      log(`[main] ${r.program.keyword} "${r.program.title}": ${r.reservable ? `予約可 (${r.openSlots.length}件)` : `予約不可 (${r.reason})`}`);
    }

    if (config.alwaysNotifyDiscord) {
      await sendDiscordDebugNotification(results, 'ALWAYS_NOTIFY_DISCORD=true のため、予約可否に関係なく通知しています。');
      log('[main] debug discord notification sent');
    }

    // 一度通知した枠でも、満席などで予約不可に戻ったら記録から外し、再び空いたときに再通知する
    // （確認中にエラーになった項目の記録は判断できないので残す）
    const failed = results.filter(r => r.failed);
    pruneNotifiedSlots(
      slot => !failed.some(r => r.program.keyword === slot.program && r.program.title === slot.eventTitle),
      new Set(results.flatMap(r => r.openSlots.map(slot => slot.key)))
    );

    const reservable = results.filter(r => r.reservable);
    if (!reservable.length) {
      log('[main] no reservable target');
      return;
    }

    const notifiedKeys = loadNotifiedKeys();
    const newSlots = reservable.flatMap(r => r.openSlots).filter(slot => !notifiedKeys.has(slot.key));
    if (!newSlots.length) {
      log('[main] reservable slots found, but all already notified');
      return;
    }

    const newKeys = new Set(newSlots.map(slot => slot.key));
    // 新しい枠が出たプログラムについては、既通知分も含めた予約可能日程の一覧を通知する
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
