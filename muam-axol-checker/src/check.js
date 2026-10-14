const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromPage, isOpenSlot, normalizeText } = require('./parser');
const { loadNotifiedKeys, appendNotifiedSlots } = require('./store');
const { sendDiscordNotification, sendDiscordDebugNotification } = require('./discord');
const { scheduleNextWake, sleepNowIfEnabled } = require('./wake');
const { ensureDirs, log, warn, error, saveDebug } = require('./logger');

const BUILD_VERSION = '2026-07-10-muam-online-first-onsite-fallback';

function absUrl(pathOrUrl) {
  return new URL(pathOrUrl, config.baseUrl).toString();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectPathRegex(selectPath) {
  const pathname = new URL(selectPath, config.baseUrl).pathname;
  return new RegExp(`${escapeRegExp(pathname)}(?:$|[?#])?`);
}

async function waitSoft(page, label, ms = 2500) {
  log(`[wait] ${label}: ${ms}ms`);
  await page.waitForTimeout(ms);
}

async function gotoAndSettle(page, url, label, options = {}) {
  const {
    expectedUrlRegex,
    expectedSelector,
    expectedText,
    retries = 1,
    settleMs = 1800
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    log(`[nav] goto ${label} attempt=${attempt}: ${url}`);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      await page.waitForTimeout(settleMs);

      if (expectedUrlRegex) {
        await page.waitForURL(expectedUrlRegex, { timeout: 10000 });
      }

      if (expectedSelector) {
        await page.waitForSelector(expectedSelector, { timeout: 20000 });
      }

      if (expectedText) {
        const body = normalizeText(await page.locator('body').innerText({ timeout: 30000 }));
        const expectedTexts = Array.isArray(expectedText) ? expectedText : [expectedText];
        const ok = expectedTexts.some(text => body.includes(text));
        if (!ok) {
          throw new Error(`expected text not found: ${expectedTexts.join(' OR ')}`);
        }
      }

      log(`[nav] arrived ${label}: ${page.url()}`);
      return;
    } catch (e) {
      lastError = e;
      warn(`[nav] ${label} attempt=${attempt} failed: ${e.message}`);
      await saveDebug(page, `${label}_attempt_${attempt}_failed`);
      await waitSoft(page, `${label} retry wait`, 3000);
    }
  }

  throw lastError || new Error(`${label} navigation failed`);
}

async function login(page) {
  log(`[login] opening ${config.loginUrl}`);

  await gotoAndSettle(page, config.loginUrl, 'login', {
    expectedSelector: 'input[name="id"], input[name="password"]',
    retries: 1,
    settleMs: 1000
  });

  await page.waitForSelector('input[name="id"]', { timeout: 30000 });
  await page.waitForSelector('input[name="password"]', { timeout: 30000 });

  await page.fill('input[name="id"]', config.axolId);
  await page.fill('input[name="password"]', config.axolPassword);

  log('[login] submitting');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    page.click('button[type="submit"]')
  ]);

  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);

  // ログイン直後はセッション/メニューが安定するまで待つ。
  await waitSoft(page, 'after login session settle', config.afterLoginWaitMs);

  const body = normalizeText(await page.locator('body').innerText({ timeout: 30000 }));
  if (body.includes('ログイン') && body.includes('パスワード') && !body.includes('トップ') && !body.includes('予約・確認フォーム')) {
    await saveDebug(page, 'login_failed');
    throw new Error('ログイン後もログイン画面にいるようです。ID/PWを確認してください。');
  }

  log(`[login] current url after login: ${page.url()}`);
}

async function ensureTopPage(page) {
  // ログイン後に form/*/select へ飛ぶ場合もあるので、トップにいなければトップへ揃える。
  const body = normalizeText(await page.locator('body').innerText({ timeout: 30000 }).catch(() => ''));
  if (body.includes('トップ') && body.includes('予約・確認フォーム')) {
    log('[nav] already on top-like page');
    return;
  }

  const topUrl = absUrl(config.topPath);
  await gotoAndSettle(page, topUrl, 'top', {
    expectedUrlRegex: /\/mypage\/top(?:$|[?#])?/,
    expectedText: ['トップ', '予約・確認フォーム'],
    retries: 1,
    settleMs: 1800
  });
}

async function openReservationFormList(page) {
  const formUrl = absUrl(config.formListPath);

  await gotoAndSettle(page, formUrl, 'reservation_form_list_direct', {
    expectedUrlRegex: /\/mypage\/form(?:$|[?#])?/,
    expectedSelector: '.event__item, body#mypage_form, button#button1, button#button2',
    expectedText: ['予約・確認フォーム', '【オンライン】', '【対面】'],
    retries: config.navigationRetries,
    settleMs: 2200
  }).catch(async directError => {
    warn(`[nav] direct /form failed. fallback to visible left-menu click: ${directError.message}`);
    await saveDebug(page, 'form_direct_failed_before_visible_click');

    await ensureTopPage(page);

    // フォールバック: 非表示SPメニューを避け、PC左側メニュー内の可視リンクだけをクリック。
    const pcMenuLink = page.locator('div.menu__back.pc__menu a[href="form"]:visible').filter({ hasText: '予約・確認フォーム' }).first();
    await pcMenuLink.waitFor({ state: 'visible', timeout: 30000 });

    await Promise.all([
      page.waitForURL(/\/mypage\/form(?:$|[?#])?/, { timeout: 30000 }),
      pcMenuLink.click()
    ]).catch(async clickError => {
      warn(`[nav] visible menu click failed: ${clickError.message}`);
      await saveDebug(page, 'visible_menu_click_failed');
      throw clickError;
    });

    await page.waitForSelector('.event__item, body#mypage_form, button#button1, button#button2', { timeout: 30000 });
    await waitSoft(page, 'after form visible click settle', 1500);
  });

  const body = normalizeText(await page.locator('body').innerText({ timeout: 30000 }));
  if (!body.includes('予約・確認フォーム')) {
    await saveDebug(page, 'reservation_form_list_failed');
    throw new Error('予約・確認フォーム一覧への遷移に失敗しました。debug HTML/screenshotを確認してください。');
  }

  log('[nav] reservation form list opened');
}

async function openEventSelect(page, eventConfig) {
  const selectUrl = absUrl(eventConfig.selectPath);
  const label = `${eventConfig.key}_event_select_direct`;

  await gotoAndSettle(page, selectUrl, label, {
    expectedUrlRegex: selectPathRegex(eventConfig.selectPath),
    expectedSelector: '.reserve__item, .item__recep, form[name="form1"]',
    expectedText: eventConfig.expectedText || [eventConfig.label, '5daysサマーインターン'],
    retries: config.navigationRetries,
    settleMs: 2200
  }).catch(async directError => {
    warn(`[nav] direct ${eventConfig.selectPath} failed. fallback to list button click: ${directError.message}`);
    await saveDebug(page, `${eventConfig.key}_direct_failed_before_button_click`);

    await openReservationFormList(page);

    const button = page.locator(`${eventConfig.listButtonSelector}:visible`).first();
    await button.waitFor({ state: 'visible', timeout: 30000 });

    await Promise.all([
      page.waitForURL(selectPathRegex(eventConfig.selectPath), { timeout: 30000 }),
      button.click()
    ]).catch(async clickError => {
      warn(`[nav] ${eventConfig.key} button click failed: ${clickError.message}`);
      await saveDebug(page, `${eventConfig.key}_button_click_failed`);
      throw clickError;
    });

    await page.waitForSelector('.reserve__item, .item__recep, form[name="form1"]', { timeout: 30000 });
    await waitSoft(page, `after ${eventConfig.key} button click settle`, 1500);
  });

  const body = normalizeText(await page.locator('body').innerText({ timeout: 30000 }));
  const expectedTexts = eventConfig.expectedText || [eventConfig.label, '5daysサマーインターン'];
  const ok = expectedTexts.some(text => body.includes(text));
  if (!ok) {
    await saveDebug(page, `${eventConfig.key}_event_select_failed`);
    throw new Error(`${eventConfig.label}予約画面への遷移に失敗した可能性があります。debug HTML/screenshotを確認してください。`);
  }

  log(`[nav] ${eventConfig.label} event select opened`);
}

async function checkEvent(page, eventConfig) {
  await openEventSelect(page, eventConfig);
  await saveDebug(page, `${eventConfig.key}_event_select`);

  const slots = await extractSlotsFromPage(page, eventConfig);
  const openSlots = slots.filter(isOpenSlot);

  log(`[check:${eventConfig.key}] url: ${page.url()}`);
  log(`[check:${eventConfig.key}] total slots: ${slots.length}`);
  log(`[check:${eventConfig.key}] non-full/open slots: ${openSlots.length}`);
  log(`[check:${eventConfig.key}] slots: ${JSON.stringify(slots, null, 2)}`);

  return { eventConfig, slots, openSlots, pageUrl: page.url() };
}

async function main() {
  ensureDirs();
  log('==================================================');
  log(`[main] build=${BUILD_VERSION}`);
  log(`[main] started. headless=${config.headless}, alwaysNotifyDiscord=${config.alwaysNotifyDiscord}`);

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
    await saveDebug(page, 'after_login');

    await ensureTopPage(page);
    await saveDebug(page, 'top_ready');

    await openReservationFormList(page);
    await saveDebug(page, 'reservation_form_list');

    const onlineConfig = config.eventChecks.find(event => event.key === 'online') || config.eventChecks[0];
    const onsiteConfig = config.eventChecks.find(event => event.key === 'onsite') || config.eventChecks[1];

    const results = [];
    const onlineResult = await checkEvent(page, onlineConfig);
    results.push(onlineResult);

    if (!onlineResult.openSlots.length) {
      log('[main] online has no non-full/open slots. checking onsite as fallback.');
      const onsiteResult = await checkEvent(page, onsiteConfig);
      results.push(onsiteResult);
    } else {
      log('[main] online has non-full/open slots. skip onsite fallback check.');
    }

    const slots = results.flatMap(result => result.slots);
    const openSlots = results.flatMap(result => result.openSlots);
    const pageUrl = results[results.length - 1] ? results[results.length - 1].pageUrl : page.url();

    log(`[main] final url: ${pageUrl}`);
    log(`[main] checked targets: ${results.map(result => result.eventConfig.label).join(', ')}`);
    log(`[main] total slots: ${slots.length}`);
    log(`[main] non-full/open slots: ${openSlots.length}`);

    if (config.alwaysNotifyDiscord) {
      await sendDiscordDebugNotification({
        slots,
        openSlots,
        pageUrl,
        note: 'ALWAYS_NOTIFY_DISCORD=true のため、満席以外の枠の有無に関係なく通知しています。'
      });
      log('[main] debug discord notification sent');
    }

    if (!slots.length) {
      warn('[main] no slots parsed. Check logs/debug.');
      return;
    }

    if (!openSlots.length) {
      log('[main] no non-full/open slots');
      return;
    }

    const notifiedKeys = loadNotifiedKeys();
    const newOpenSlots = openSlots.filter(slot => !notifiedKeys.has(slot.key));

    if (!newOpenSlots.length) {
      log('[main] non-full/open slots found, but all already notified');
      return;
    }

    log(`[main] new non-full/open slots: ${newOpenSlots.length}`);
    await sendDiscordNotification(newOpenSlots);
    appendNotifiedSlots(newOpenSlots);
    log('[main] discord notified and store updated');
  } finally {
    await context.close();
    await browser.close();
    sleepNowIfEnabled();
    log('[main] finished');
  }
}

main().catch(e => {
  error('[main] failed', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
