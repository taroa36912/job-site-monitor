const { config } = require('./config');
const { normalizeText } = require('./parser');
const { log, saveDebug } = require('./logger');

async function settle(page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(ms);
}

async function login(page) {
  log(`[login] opening ${config.loginUrl}`);
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ログインフォーム frmLogon（action=/eARTH/common/Logon）: userid / password / ［ログイン］
  const form = page.locator('form[name="frmLogon"]');
  await form.locator('input[name="userid"]').waitFor({ timeout: 30000 });
  await form.locator('input[name="userid"]').fill(config.e2rId);
  await form.locator('input[name="password"]').fill(config.e2rPassword);

  log('[login] submitting');
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  try {
    await form.locator('button[type="submit"]').first().click({ timeout: 10000 });
  } catch (e) {
    // 読み込み直後の演出（カバー画像など）がボタンに重なってクリックできないことがあるため、フォームを直接送信する
    log(`[login] click failed (${e.message.split('\n')[0]}). submitting form directly`);
    await form.evaluate(f => f.requestSubmit ? f.requestSubmit() : f.submit());
  }
  await navigation;
  await settle(page, config.afterLoginWaitMs);

  // 成功するとマイページ（/eARTH/e2r/user/...、ヘッダーに「選考予約」メニュー）へ遷移する
  if (!(await page.locator(`a#${config.menuId}`).count())) {
    await saveDebug(page, 'login_failed');
    const body = normalizeText(await page.locator('body').innerText().catch(() => ''));
    throw new Error(`ログインに失敗しました（${page.url()}）: ${body.slice(0, 80)} E2R_ID/E2R_PASSWORD を確認してください。`);
  }
  log(`[login] current url after login: ${page.url()}`);
}

/** ヘッダーメニュー「選考予約」の下にあるリンク（文言とURL）の一覧 */
async function listMenuLinks(page) {
  return page.$$eval(`a#${config.menuId} + * a[href]`, as => as.map(a => ({
    text: a.innerText.replace(/\s+/g, ' ').trim(),
    href: a.href
  })).filter(a => /^https?:/.test(a.href)));
}

/** 日程ページを開く。リンクは本来 iframe（name=main）で開くが、URL を直接開いても表示できる。 */
async function openSchedulePage(page, link) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    log(`[nav] opening "${link.text}" attempt=${attempt}: ${link.href}`);
    await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => log(`[nav] goto failed: ${e.message}`));
    await settle(page);
    // 日程ページなら本文フォーム form1 か選考会の一覧（div.event）がある。無ければ一時的な読み込み失敗とみなして1回だけ読み直す
    if (await page.locator('form[name="form1"], .event').count()) return;
    await saveDebug(page, 'schedule_page_empty');
    await page.waitForTimeout(3000);
  }
}

module.exports = { login, listMenuLinks, openSchedulePage };
