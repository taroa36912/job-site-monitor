const { config } = require('./config');
const { normalizeText } = require('./parser');
const { log, warn, saveDebug } = require('./logger');

const FORM_LIST_URL_REGEX = /\/mypage\/form(?:$|[?#])/;

function absUrl(pathOrUrl) {
  return new URL(pathOrUrl, config.baseUrl).toString();
}

async function bodyText(page) {
  return normalizeText(await page.locator('body').innerText({ timeout: 30000 }).catch(() => ''));
}

async function settle(page, ms) {
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(ms);
}

async function login(page) {
  log(`[login] opening ${config.loginUrl}`);
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForSelector('input[name="id"]', { timeout: 30000 });
  await page.waitForSelector('input[name="password"]', { timeout: 30000 });

  await page.fill('input[name="id"]', config.axolId);
  await page.fill('input[name="password"]', config.axolPassword);

  log('[login] submitting');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    page.click('button[type="submit"], input[type="submit"]')
  ]);

  // ログイン直後はセッション/メニューが安定するまで待つ（MUAM版と同じ対策）。
  await settle(page, config.afterLoginWaitMs);

  const stillLogin = await page.locator('input[name="password"]').count().catch(() => 0);
  if (stillLogin > 0 && /\/mypage\/login/.test(page.url())) {
    await saveDebug(page, 'login_failed');
    throw new Error('ログイン後もログイン画面にいるようです。AXOL_ID/AXOL_PASSWORD を確認してください。');
  }

  log(`[login] current url after login: ${page.url()}`);
}

async function isFormListPage(page) {
  if (!FORM_LIST_URL_REGEX.test(page.url())) return false;
  return (await page.locator('.event__list, .event__item').count().catch(() => 0)) > 0;
}

async function openFormListByMenu(page) {
  await page.goto(absUrl(config.topPath), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page, 1500);

  for (const text of config.formListMenuTexts) {
    // PCメニューとSP用メニューで同じリンクが重複するため、可視のものだけを使う。
    const link = page.locator('a:visible, button:visible').filter({ hasText: text }).first();
    if (!(await link.count())) continue;

    log(`[nav] clicking menu "${text}"`);
    await Promise.all([
      page.waitForURL(FORM_LIST_URL_REGEX, { timeout: 30000 }).catch(() => null),
      link.click()
    ]);
    await settle(page, 1500);
    if (await isFormListPage(page)) return true;
  }
  return false;
}

async function openFormList(page) {
  const url = absUrl(config.formListPath);

  for (let attempt = 1; attempt <= config.navigationRetries + 1; attempt += 1) {
    log(`[nav] goto form list attempt=${attempt}: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 2000);
      if (await isFormListPage(page)) {
        log(`[nav] form list opened: ${page.url()}`);
        return;
      }
      warn(`[nav] not on form list. current url: ${page.url()}`);
    } catch (e) {
      warn(`[nav] form list attempt=${attempt} failed: ${e.message}`);
    }
    await saveDebug(page, `form_list_attempt_${attempt}_failed`);
    await page.waitForTimeout(3000);
  }

  warn('[nav] direct /form failed. fallback to top menu click.');
  if (await openFormListByMenu(page)) {
    log(`[nav] form list opened by menu: ${page.url()}`);
    return;
  }

  await saveDebug(page, 'form_list_failed');
  throw new Error('予約一覧（mypage/form）への遷移に失敗しました。logs/debug を確認してください。');
}

/**
 * 予約一覧の各項目を抽出する。
 * 実画面では ul.event__list > li.event__item に h2.title（イベント名）、.event__text .info（案内文）、
 * 受付中なら button「予約画面へ進む」が入っている。
 */
async function extractEventItems(page) {
  const items = await page.evaluate(({ entryButtonTexts, reservedItemTexts, closedItemTexts }) => {
    function clean(s) {
      return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function text(el) {
      return el ? clean(el.innerText || el.textContent) : '';
    }

    let nodes = Array.from(document.querySelectorAll('.event__item'));
    if (!nodes.length) {
      // 想定外のレイアウト用フォールバック: ボタンを含むリスト/表の行
      nodes = Array.from(document.querySelectorAll('li, tr, section'))
        .filter(el => el.querySelector('button, a, input[type="button"], input[type="submit"]'));
    }

    return nodes.map((node, index) => {
      const titleEl = node.querySelector('h2.title, .event__title, h2, h3, h4');
      const controls = Array.from(node.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
        .map(el => ({
          text: clean(el.innerText || el.textContent || el.value),
          disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true' || /disabled|is-disabled/.test(el.className || ''),
          href: el.getAttribute('href') || '',
          onclick: el.getAttribute('onclick') || '',
          id: el.id || ''
        }))
        .filter(c => c.text);

      const entryButton = controls.find(c => entryButtonTexts.some(t => c.text.includes(t))) || null;
      const all = text(node);
      const info = text(node.querySelector('.inner')) || text(node.querySelector('.event__text')) || all;

      return {
        index,
        title: text(titleEl) || all.slice(0, 80),
        text: all,
        info,
        controls,
        entryButton,
        reserved: reservedItemTexts.some(t => all.includes(t)),
        closedReason: closedItemTexts.find(t => all.includes(t)) || ''
      };
    });
  }, { entryButtonTexts: config.entryButtonTexts, reservedItemTexts: config.reservedItemTexts, closedItemTexts: config.closedItemTexts });

  return items;
}

/**
 * 予約一覧の index 番目の項目の「予約画面へ進む」を押し、遷移後のURLを返す。
 * ボタンの遷移先は form/<番号>/select（例: button#button15 → form/15/select）だが、
 * 番号はイベントごとに変わるため、タイトルで項目を特定してクリックで辿る。
 */
async function openEventItem(page, item) {
  const marker = `mizuho-checker-${item.index}`;
  const marked = await page.evaluate(({ index, marker, entryText }) => {
    let nodes = Array.from(document.querySelectorAll('.event__item'));
    if (!nodes.length) {
      nodes = Array.from(document.querySelectorAll('li, tr, section'))
        .filter(el => el.querySelector('button, a, input[type="button"], input[type="submit"]'));
    }
    const node = nodes[index];
    if (!node) return false;
    const el = Array.from(node.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
      .find(c => (c.innerText || c.textContent || c.value || '').replace(/\s+/g, ' ').trim() === entryText);
    if (!el) return false;
    el.setAttribute('data-checker-target', marker);
    return true;
  }, { index: item.index, marker, entryText: item.entryButton.text });

  if (!marked) throw new Error(`予約一覧の項目「${item.title}」のボタンが見つかりませんでした。`);

  const before = page.url();
  const target = page.locator(`[data-checker-target="${marker}"]`).first();
  await target.scrollIntoViewIfNeeded().catch(() => null);
  await Promise.all([
    page.waitForURL(url => url.toString() !== before, { timeout: 30000 }).catch(() => null),
    target.click()
  ]);
  await settle(page, 2000);

  log(`[nav] opened "${item.title}": ${page.url()}`);
  return page.url();
}

module.exports = { login, openFormList, extractEventItems, openEventItem, absUrl, bodyText };
