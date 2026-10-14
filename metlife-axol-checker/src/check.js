const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromTargetPage, isOpenSlot } = require('./parser');
const { loadNotifiedKeys, appendNotifiedSlots } = require('./store');
const { sendDiscordNotification } = require('./discord');
const { scheduleNextWake, sleepNowIfEnabled } = require('./wake');
const { log, error } = require('./logger');

function ensureLogsDir() {
  const dir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function saveDebug(page, label) {
  const dir = ensureLogsDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(dir, `${ts}_${label}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => null);
  const html = await page.content().catch(() => '');
  if (html) fs.writeFileSync(`${base}.html`, html);
  log(`[debug] saved ${base}.png/html`);
}

async function login(page) {
  log(`[login] goto ${config.loginUrl}`);
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForSelector('input[name="id"]', { timeout: 30000 });
  await page.waitForSelector('input[name="password"]', { timeout: 30000 });

  log('[login] filling id/password');
  await page.fill('input[name="id"]', config.axolId);
  await page.fill('input[name="password"]', config.axolPassword);

  log('[login] submit');
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null),
    page.click('button[type="submit"], input[type="submit"]')
  ]);
  await page.waitForTimeout(3000);

  const bodyText = await page.locator('body').innerText({ timeout: 30000 });
  if (bodyText.includes('ログイン') && bodyText.includes('パスワード') && !bodyText.includes('応募フォーム')) {
    await saveDebug(page, 'login_failed');
    throw new Error('ログイン後もログイン画面にいるようです。AXOL_ID/AXOL_PASSWORD を確認してください。');
  }
}

async function openApplicationFormFromTop(page) {
  log('[top] ensuring top page, then clicking 応募フォーム');

  let bodyText = await page.locator('body').innerText({ timeout: 30000 });
  if (!bodyText.includes('トップ')) {
    log(`[top] current page is not top. goto ${config.topUrl}`);
    await page.goto(config.topUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
  }

  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button'));
    const target = candidates.find(el => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return text.includes('応募フォーム');
    });

    if (!target) return false;
    target.click();
    return true;
  });

  if (!clicked) {
    log('[top] 応募フォーム link not found. fallback to form url.');
    await page.goto(config.formUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
  }

  await page.waitForTimeout(2000);

  bodyText = await page.locator('body').innerText({ timeout: 30000 });
  if (!bodyText.includes('応募フォーム')) {
    await saveDebug(page, 'application_form_not_reached');
    throw new Error('トップページから応募フォームへ遷移できていない可能性があります。logs を確認してください。');
  }
}

async function openTargetProgram(page) {
  const bodyText = await page.locator('body').innerText({ timeout: 30000 });
  if (!bodyText.includes(config.targetProgramTitle)) {
    log('[form] target title not found on application form page. trying direct target select url.');
    await page.goto(config.targetSelectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    return;
  }

  log(`[form] clicking target program: ${config.targetProgramTitle}`);
  const clicked = await page.evaluate((targetTitle) => {
    const items = Array.from(document.querySelectorAll('li.event__item, .event__item'));
    const target = items.find(item => (item.textContent || '').includes(targetTitle));
    if (!target) return false;

    const button = Array.from(target.querySelectorAll('button, a')).find(el => (el.textContent || '').includes('応募画面へ進む'));
    if (!button) return false;

    button.click();
    return true;
  }, config.targetProgramTitle);

  if (!clicked) {
    log('[form] click failed. using direct target select url.');
    await page.goto(config.targetSelectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
  }

  await page.waitForTimeout(2500);
}

async function main() {
  log('==================================================');
  log('[main] started');

  // 毎回、次回のスリープ解除を先に予約しておく
  scheduleNextWake();

  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
    userAgent: config.browserUserAgent
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    await login(page);
    await openApplicationFormFromTop(page);
    await openTargetProgram(page);

    if (config.saveDebugArtifacts) await saveDebug(page, 'target_page');

    const text = await page.locator('body').innerText({ timeout: 30000 });
    if (!text.includes(config.targetProgramTitle) && !text.includes('参加を希望する日程')) {
      await saveDebug(page, 'unexpected_target_page');
      throw new Error('対象の応募日程ページに到達できていない可能性があります。logs のスクリーンショット/HTMLを確認してください。');
    }

    const slots = await extractSlotsFromTargetPage(page);
    const openSlots = slots.filter(isOpenSlot);

    log(`[main] total slots: ${slots.length}`);
    log(`[main] open slots: ${openSlots.length}`);
    log('[main] slots:', JSON.stringify(slots, null, 2));

    if (slots.length === 0) {
      await saveDebug(page, 'no_slots_parsed');
      throw new Error('日程枠を1件も解析できませんでした。ページ構造が変わった可能性があります。');
    }

    if (openSlots.length === 0) {
      log('[main] no open slots. all target slots are 満席/受付終了 or closed.');
      return;
    }

    const notifiedKeys = loadNotifiedKeys();
    const newOpenSlots = openSlots.filter(slot => !notifiedKeys.has(slot.key));

    if (newOpenSlots.length === 0) {
      log('[main] open slots found, but all already notified.');
      return;
    }

    log(`[main] new open slots: ${newOpenSlots.length}`);
    log('[main] new open slot details:', JSON.stringify(newOpenSlots, null, 2));

    await sendDiscordNotification(newOpenSlots);
    appendNotifiedSlots(newOpenSlots);
    log('[main] Discord notified and store updated.');
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
    sleepNowIfEnabled();
    log('[main] finished');
  }
}

main().catch(err => {
  error('[main] failed');
  error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
