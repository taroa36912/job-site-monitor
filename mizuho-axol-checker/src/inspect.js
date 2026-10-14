// レイアウト確認用。ログインして トップ → 予約一覧 → 押せる各「予約画面へ進む」の先 を
// HTML/スクリーンショット/抽出結果JSONとして logs/inspect/ に保存する。
// 日程の選択や「次へ」「確定」は一切押さない（閲覧のみ）。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromPage } = require('./parser');
const { login, openFormList, extractEventItems, openEventItem, absUrl } = require('./navigator');
const { log, warn, error } = require('./logger');

const outDir = path.join(config.inspectDir, new Date().toISOString().replace(/[:.]/g, '-'));

async function dump(page, label, extra) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, label.replace(/[^a-zA-Z0-9_-]/g, '_'));
  fs.writeFileSync(`${base}.html`, await page.content(), 'utf8');
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => null);
  if (extra !== undefined) fs.writeFileSync(`${base}.json`, JSON.stringify({ url: page.url(), ...extra }, null, 2), 'utf8');
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

  try {
    await login(page);
    await dump(page, '01_after_login', {});

    await page.goto(absUrl(config.topPath), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const menuLinks = await page.$$eval('a', as => as.map(a => ({ text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') })).filter(a => a.text));
    await dump(page, '02_top', { menuLinks });

    await openFormList(page);
    const items = await extractEventItems(page);
    await dump(page, '03_form_list', { items });

    let n = 0;
    for (const item of items) {
      if (!item.entryButton || item.entryButton.disabled) continue;
      n += 1;
      try {
        const url = await openEventItem(page, item);
        const slots = await extractSlotsFromPage(page, { keyword: 'inspect', title: item.title, url });
        await dump(page, `04_item_${item.index}_select`, { title: item.title, slots });
      } catch (e) {
        warn(`[inspect] item #${item.index} failed: ${e.message}`);
        await dump(page, `04_item_${item.index}_failed`, { title: item.title, error: e.message });
      }
      await openFormList(page);
    }

    log(`[inspect] done. items=${items.length}, opened=${n}. output: ${outDir}`);
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

main().catch(e => {
  error('[inspect] failed', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
