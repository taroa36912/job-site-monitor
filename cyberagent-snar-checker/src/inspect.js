// レイアウト確認用。ログインして マイページトップ → 左メニューの各予約画面 を順に開き、
// HTML/スクリーンショット/抽出結果JSONを logs/inspect/ に保存する。
// 日程の「予約受付中」や確定ボタンは一切押さない（閲覧のみ）。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromPage, isOpenSlot } = require('./parser');
const { login, openMenuLink } = require('./navigator');
const { log, warn, error } = require('./logger');

const outDir = path.join(config.inspectDir, new Date().toISOString().replace(/[:.]/g, '-'));

async function dump(page, label, extra) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, label.replace(/[^a-zA-Z0-9_-]/g, '_'));
  fs.writeFileSync(`${base}.html`, await page.content(), 'utf8');
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => null);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ url: page.url(), ...extra }, null, 2), 'utf8');
  log(`[inspect] saved ${base}.*`);
}

async function main() {
  const browser = await chromium.launch({ headless: config.headless, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.dismiss().catch(() => null));

  try {
    await login(page);
    // 左メニューのうち、ポストバックで予約画面などへ進むリンクの一覧
    const menuLinks = await page.$$eval('a[href^="javascript:__doPostBack(\'uc_pagemenu"]', as =>
      as.map(a => a.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    await dump(page, '01_mypage_top', { menuLinks });

    let n = 0;
    for (const text of menuLinks) {
      if (/メッセージ/.test(text)) continue;
      n += 1;
      try {
        const title = await openMenuLink(page, text);
        const slots = await extractSlotsFromPage(page, { menuText: text, title, url: page.url() });
        await dump(page, `02_menu_${n}`, { title, slots: slots.map(s => ({ ...s, open: isOpenSlot(s) })) });
      } catch (e) {
        warn(`[inspect] "${text}" failed: ${e.message}`);
        await dump(page, `02_menu_${n}_failed`, { title: text, error: e.message });
      }
    }

    log(`[inspect] done. menu links=${menuLinks.length}. output: ${outDir}`);
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

main().catch(e => {
  error('[inspect] failed', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
