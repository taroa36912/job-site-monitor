const { config } = require('./config');
const { normalizeText } = require('./parser');
const { log, saveDebug } = require('./logger');

async function settle(page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(ms);
}

async function bodyText(page) {
  return normalizeText(await page.locator('body').innerText({ timeout: 30000 }).catch(() => ''));
}

// i-webs の画面遷移はほぼ「隠しフォームの submit」。フォーム名を指定して送信し、遷移を待つ。
async function submitForm(page, formName) {
  const ok = await page.evaluate(name => {
    const form = document.forms[name];
    if (!form) return false;
    form.submit();
    return true;
  }, formName);
  if (!ok) return false;
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  await settle(page);
  return true;
}

async function login(page) {
  log(`[login] opening ${config.baseUrl}`);
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ログインフォーム formLogin: #gksid / input[name=gkspw]（idは "!gkspw"）/ ボタン #loginbtn
  await page.waitForSelector('#gksid', { timeout: 30000 });
  await page.fill('#gksid', config.iwebsId);
  await page.fill('input[name="gkspw"]', config.iwebsPassword);

  log('[login] submitting');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    page.click('#loginbtn')
  ]);
  await settle(page, config.afterLoginWaitMs);

  // 成功するとマイページトップ applicant/top/index/... へ遷移する
  if (!/\/applicant\/top\//.test(page.url())) {
    await saveDebug(page, 'login_failed');
    throw new Error(`ログインに失敗しました（${page.url()}）: ${(await bodyText(page)).slice(0, 80)} IWEBS_ID/IWEBS_PASSWORD を確認してください。`);
  }
  log(`[login] current url after login: ${page.url()}`);
}

/** マイページトップへ戻る（ヘッダーのロゴと同じ form_top を送信） */
async function goTop(page) {
  if (/\/applicant\/top\/index/.test(page.url())) return;
  if (!(await submitForm(page, 'form_top'))) {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page);
  }
}

/**
 * マイページトップで、見出しに text を含む項目の「申込/確認」を押し、日程選択画面まで進む。
 * 実画面の構造:
 *   <div class="contents_bdr_wrap"><div class="step_textArea"><h3>人事面談</h3>…</div>
 *     <p class="step_entryArea"><input type="button" value="申込/確認" onclick="javaScript:document.form_next_step1.submit();"></p>
 *     <form name="form_next_step1" action="…/applicant/event/index/">
 *   → 説明画面「『予約開始』をクリックして…」（form_next → …/applicant/event/day-select/）
 *   → 日程選択画面
 * 戻り値 state: day-select（日程選択画面を開いた）/ reserved（予約済みの画面）/ not-found / unknown
 */
async function openTarget(page, text) {
  await goTop(page);

  const found = await page.evaluate(target => {
    function clean(s) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }
    // Step Navi / Event Information とも、1項目 = div.contents_bdr_wrap（見出し h3 と「申込/確認」ボタン）
    for (const block of document.querySelectorAll('.contents_bdr_wrap')) {
      const heading = block.querySelector('h3');
      if (!heading || !clean(heading.innerText).includes(target)) continue;
      const btn = Array.from(block.querySelectorAll('input[type="button"], input[type="submit"], button'))
        .find(b => clean(b.value || b.innerText).includes('申込'));
      if (!btn) return { title: clean(heading.innerText), formName: '' };
      const m = String(btn.getAttribute('onclick') || '').match(/document\.([\w-]+)\.submit/);
      return { title: clean(heading.innerText), formName: m ? m[1] : '' };
    }
    return null;
  }, text);

  if (!found || !found.formName) {
    await saveDebug(page, 'target_not_found');
    return { state: 'not-found', title: text };
  }

  log(`[nav] opening "${found.title}" via ${found.formName}`);
  await submitForm(page, found.formName);

  let body = await bodyText(page);
  if (config.reservedPageTexts.some(t => body.includes(t))) {
    await saveDebug(page, 'target_reserved');
    return { state: 'reserved', title: found.title };
  }

  // 説明画面の「予約開始」（form_next）を押して日程選択へ
  if (!/day-select/.test(page.url()) && body.includes('予約開始')) {
    log('[nav] 予約開始');
    await submitForm(page, 'form_next');
    body = await bodyText(page);
  }

  if (/day-select/.test(page.url()) || body.includes('日程選択')) {
    log(`[nav] opened day-select for "${found.title}": ${page.url()}`);
    return { state: 'day-select', title: found.title };
  }

  await saveDebug(page, 'target_unknown_page');
  return { state: 'unknown', title: found.title };
}

module.exports = { login, goTop, openTarget, submitForm, bodyText, settle };
