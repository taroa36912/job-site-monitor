// レイアウト確認用。ログインして マイページトップ → 各項目の「申込/確認」→「予約開始」→ 日程選択画面 を順に開き、
// HTML/スクリーンショット/抽出結果JSONを logs/inspect/ に保存する。
// 日程の「予約」ボタンや「予約申し込み」は一切押さない（閲覧のみ）。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config } = require('./config');
const { extractSlotsFromPage, isOpenSlot } = require('./parser');
const { login, goTop, openTarget } = require('./navigator');
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
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.dismiss().catch(() => null));

  try {
    await login(page);
    await goTop(page);
    // 「申込/確認」ボタンがある項目の見出し一覧
    const headings = await page.$$eval('.contents_bdr_wrap', blocks => blocks
      .filter(b => Array.from(b.querySelectorAll('input[type="button"]')).some(i => (i.value || '').includes('申込')))
      .map(b => (b.querySelector('h3') ? b.querySelector('h3').innerText : '').replace(/\s+/g, ' ').trim())
      .filter(Boolean));
    await dump(page, '01_top', { headings });

    let n = 0;
    for (const heading of headings) {
      n += 1;
      try {
        const opened = await openTarget(page, heading);
        const slots = opened.state === 'day-select' ? await extractSlotsFromPage(page, { targetText: heading, title: opened.title }) : [];
        await dump(page, `02_item_${n}`, { title: heading, state: opened.state, slots: slots.map(s => ({ ...s, open: isOpenSlot(s) })) });
      } catch (e) {
        warn(`[inspect] "${heading}" failed: ${e.message}`);
        await dump(page, `02_item_${n}_failed`, { title: heading, error: e.message });
      }
    }

    log(`[inspect] done. items=${headings.length}. output: ${outDir}`);
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

main().catch(e => {
  error('[inspect] failed', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
