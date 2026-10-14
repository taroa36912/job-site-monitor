const { config } = require('./config');
const { normalizeText } = require('./parser');
const { log, warn, saveDebug } = require('./logger');

async function settle(page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(ms);
}

async function login(page) {
  log(`[login] opening ${config.loginUrl}`);
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ログインフォームは <form name="form" action="mypage/loginCheck.aspx"> に #id / #password のみ。
  // 「ログイン」はリンク（onclick="form.submit();"）なので、フォームを直接 submit する。
  await page.waitForSelector('#id', { timeout: 30000 });
  await page.fill('#id', config.snarId);
  await page.fill('#password', config.snarPassword);

  log('[login] submitting');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    page.evaluate(() => (document.forms.form || document.querySelector('form')).submit())
  ]);
  await settle(page, config.afterLoginWaitMs);

  // 失敗時は lib/error.aspx の「ID・パスワードが正しくありません。」へ遷移する。
  if (!/\/mypage\//.test(page.url())) {
    await saveDebug(page, 'login_failed');
    const body = normalizeText(await page.locator('body').innerText().catch(() => ''));
    throw new Error(`ログインに失敗しました（${page.url()}）: ${body.slice(0, 80)} SNAR_ID/SNAR_PASSWORD を確認してください。`);
  }

  log(`[login] current url after login: ${page.url()}`);
}

/**
 * 左メニュー（マイページトップ・予約画面の両方にある）から、文字列を含むリンクを開く。
 * リンクは ASP.NET のポストバック（href="javascript:__doPostBack(...)"）で mypage/seminar.aspx へ遷移する。
 */
async function openMenuLink(page, text) {
  const link = page.locator('a').filter({ hasText: text }).first();
  if (!(await link.count())) {
    await saveDebug(page, 'menu_link_not_found');
    return null;
  }

  const title = normalizeText(await link.innerText());
  const href = await link.getAttribute('href');
  log(`[nav] opening menu "${title}"`);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    // メニューは折りたたまれて非表示のことがあるため、クリックではなくリンク先のスクリプトを実行する
    page.evaluate(h => { window.location.href = h; }, href)
  ]);
  await settle(page);

  if (!(await page.locator('#grv_EventList, #div_EventList').count())) {
    await saveDebug(page, 'event_list_not_found');
    throw new Error(`「${title}」の予約画面（日程表）が見つかりませんでした。現在のURL: ${page.url()}`);
  }

  log(`[nav] opened "${title}": ${page.url()}`);
  return title;
}

/** 日程表の次ページがあれば移動して true を返す。右矢印が灰色（moveIconGray）なら最終ページ。 */
async function goNextPage(page) {
  const next = page.locator('#a_RMoveD');
  if (!(await next.count())) return false;
  const disabled = await page.locator('#lbl_RMoveD.moveIconGray').count();
  const href = await next.getAttribute('href');
  if (disabled || !href) return false;

  const before = normalizeText(await page.locator('#lbl_RecCnt').innerText().catch(() => ''));
  log(`[nav] next page (current: ${before})`);
  // ページ送りは UpdatePanel による非同期ポストバックなので、件数表示が変わるまで待つ
  await next.click();
  await page.waitForFunction(
    prev => {
      const el = document.querySelector('#lbl_RecCnt');
      return el && el.textContent.replace(/\s+/g, ' ').trim() !== prev;
    },
    before,
    { timeout: 30000 }
  ).catch(() => warn('[nav] page counter did not change after clicking next'));
  await settle(page, 1000);
  return true;
}

module.exports = { login, openMenuLink, goNextPage };
