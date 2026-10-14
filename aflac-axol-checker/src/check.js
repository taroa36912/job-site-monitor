const path = require('path');
const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromPage, isOpenSlot } = require('./parser');
const { loadNotifiedKeys, appendNotifiedSlots } = require('./store');
const { sendDiscordNotification } = require('./discord');
const { scheduleNextWake, sleepNowIfEnabled } = require('./wake');
const { log, error, ensureDir, saveText } = require('./logger');

async function saveDebug(page, label) {
  ensureDir(config.screenshotDir);
  const ts = Date.now();
  const htmlPath = path.join(config.screenshotDir, `${label}_${ts}.html`);
  const pngPath = path.join(config.screenshotDir, `${label}_${ts}.png`);
  try { saveText(htmlPath, await page.content()); } catch (_) {}
  try { await page.screenshot({ path: pngPath, fullPage: true }); } catch (_) {}
  log(`[debug] saved ${htmlPath} / ${pngPath}`);
}

async function submitNamedForm(page, formName) {
  return await page.evaluate(name => {
    const form = document.forms[name] || document.querySelector(`form[name="${name}"]`);
    if (!form) return false;
    form.submit();
    return true;
  }, formName);
}

async function submitTargetAflacSummerForm(page) {
  return await page.evaluate(targetText => {
    function text(el) { return el && el.innerText ? el.innerText.replace(/\s+/g, ' ').trim() : ''; }
    const blocks = Array.from(document.querySelectorAll('.contents_bdr_wrap, .step_textArea, div, section'));
    for (const block of blocks) {
      if (!text(block).includes(targetText)) continue;
      const container = block.closest('.contents_bdr_wrap') || block;
      const form = container.querySelector('form') || container.nextElementSibling?.querySelector?.('form');
      if (form) {
        form.submit();
        return true;
      }
      const button = container.querySelector('input[type="button"], button, a');
      if (button) {
        button.click();
        return true;
      }
    }

    // Fallback for attached HTML: form_free_event_1 is Aflac Summer 1day.
    const fallback = document.forms['form_free_event_1'];
    if (fallback) {
      fallback.submit();
      return true;
    }
    return false;
  }, config.targetEventText);
}

async function goToChangeOrDaySelect(page) {
  const bodyText = await page.locator('body').innerText({ timeout: 30000 });

  if (bodyText.includes('申込内容を変更する')) {
    log('[main] current reservation confirmation page found. submitting form_change.');
    const ok = await submitNamedForm(page, 'form_change');
    if (!ok) {
      const clicked = await page.getByText('申込内容を変更する', { exact: false }).click({ timeout: 10000 }).then(() => true).catch(() => false);
      if (!clicked) throw new Error('申込内容を変更する button/form was not found.');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(2500);
    return;
  }

  if (bodyText.includes('予約開始')) {
    log('[main] reservation start page found. submitting form_next.');
    const ok = await submitNamedForm(page, 'form_next');
    if (!ok) {
      const clicked = await page.getByText('予約開始', { exact: false }).click({ timeout: 10000 }).then(() => true).catch(() => false);
      if (!clicked) throw new Error('予約開始 button/form was not found.');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(2500);
    return;
  }

  log('[main] no change/start page detected; assuming current page is already day-select or equivalent.');
}

async function main() {
  log('==================================================');
  log('[main] started');
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

  try {
    log(`[main] opening login page: ${config.loginUrl}`);
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('input[name="gksid"], #gksid', { timeout: 30000 });
    await page.fill('input[name="gksid"], #gksid', config.aflacId);
    await page.fill('input[name="gkspw"]', config.aflacPassword);

    log('[main] submitting login form');
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null),
      page.click('#loginbtn, input[name="login"][value="ログイン"]')
    ]);
    await page.waitForTimeout(3000);

    let bodyText = await page.locator('body').innerText({ timeout: 30000 });
    if (bodyText.includes('ログイン') && bodyText.includes('PASSWORD') && bodyText.includes('新規登録')) {
      await saveDebug(page, 'login_failed');
      throw new Error('ログイン後もログイン画面にいるようです。ID/PWまたはサイト仕様を確認してください。');
    }

    log('[main] looking for Aflac Summer 1day form on top page');
    if (!bodyText.includes(config.targetEventText)) {
      log('[main] target event text not found immediately. going to top index.');
      await page.goto(new URL('/aflac2028/applicant/top/index', config.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      bodyText = await page.locator('body').innerText({ timeout: 30000 });
    }

    if (!bodyText.includes(config.targetEventText)) {
      await saveDebug(page, 'target_event_not_found');
      throw new Error(`トップページで対象イベント「${config.targetEventText}」が見つかりませんでした。`);
    }

    const submitted = await submitTargetAflacSummerForm(page);
    if (!submitted) {
      await saveDebug(page, 'target_form_not_found');
      throw new Error('Aflac Summer 1day インターンシップの申込/確認フォームが見つかりませんでした。');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(2500);

    await goToChangeOrDaySelect(page);

    await page.waitForSelector('body', { timeout: 30000 });
    const slots = await extractSlotsFromPage(page);
    const openSlots = slots.filter(isOpenSlot);

    log(`[main] parsed slots: ${slots.length}`);
    log(`[main] open slots: ${openSlots.length}`);
    if (slots.length > 0) log('[main] slot sample:', JSON.stringify(slots.slice(0, 5), null, 2));

    if (slots.length === 0) {
      await saveDebug(page, 'no_slots_parsed');
      log('[main] no slots parsed. Please inspect debug HTML/screenshot in logs/.');
      return;
    }

    if (openSlots.length === 0) {
      log('[main] no open slots');
      return;
    }

    const notifiedKeys = loadNotifiedKeys();
    const newOpenSlots = openSlots.filter(slot => !notifiedKeys.has(slot.key));

    if (newOpenSlots.length === 0) {
      log('[main] open slots found, but all already notified');
      return;
    }

    log(`[main] new open slots: ${newOpenSlots.length}`);
    log(JSON.stringify(newOpenSlots, null, 2));
    await sendDiscordNotification(newOpenSlots);
    appendNotifiedSlots(newOpenSlots);
    log('[main] discord notified and store updated');
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
    sleepNowIfEnabled();
    log('[main] finished');
  }
}

main().catch(err => {
  error('[main] failed');
  error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
