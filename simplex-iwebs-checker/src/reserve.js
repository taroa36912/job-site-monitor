const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { openTarget, bodyText, settle } = require('./navigator');
const { log, warn } = require('./logger');

/**
 * ダイアログの扱い。普段はすべてキャンセル。
 * 自動予約で「予約申し込み」を押す瞬間だけ、出てきた確認ダイアログを OK にする。
 */
function installDialogHandler(page) {
  page.on('dialog', dialog => {
    const accept = Boolean(page.__acceptSubmitConfirm) && dialog.type() === 'confirm';
    log(`[dialog] ${accept ? 'accept' : 'dismiss'}: ${dialog.message().replace(/\s+/g, ' ')}`);
    (accept ? dialog.accept() : dialog.dismiss()).catch(() => null);
  });
}

function loadReserved() {
  try {
    const items = JSON.parse(fs.readFileSync(config.reservedStorePath, 'utf8') || '[]');
    return Array.isArray(items) ? items : [];
  } catch (_) {
    return [];
  }
}

function recordAttempt(slot, result) {
  const items = loadReserved();
  items.push({ ...slot, result: result.status, message: result.message, at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(config.reservedStorePath), { recursive: true });
  fs.writeFileSync(config.reservedStorePath, JSON.stringify(items, null, 2));
}

/** すでにこのツールで予約済みの記録があるか */
function alreadyReserved(targetText) {
  return loadReserved().some(item => item.program === targetText && item.result === 'reserved');
}

/** 同じ枠の予約失敗をすでに通知済みか（毎回同じ失敗を通知しないため） */
function failureAlreadyRecorded(slot) {
  return loadReserved().some(item => item.key === slot.key && item.result === 'failed');
}

// 「2026/10/07(水)」「2026年10月7日」→ { y, m, d }
function parseDay(text) {
  const s = String(text || '');
  const m = s.match(/(\d{4})\s*[\/年]\s*(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const md = s.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})日?/);
  return md ? { y: new Date().getFullYear(), m: Number(md[1]), d: Number(md[2]) } : null;
}

function parseTime(text) {
  const m = String(text || '').match(/(\d{1,2}):(\d{2})/);
  return m ? { h: Number(m[1]), min: Number(m[2]) } : null;
}

function sortValue(slot) {
  const day = parseDay(slot.day);
  const time = parseTime(slot.time) || { h: 0, min: 0 };
  if (!day) return -1;
  return ((day.y * 100 + day.m) * 100 + day.d) * 10000 + time.h * 100 + time.min;
}

/** 予約可能な枠のうち、開催日時が最も遅いもの（同じなら表で後ろにあるもの） */
function pickLastSlot(openSlots) {
  let best = null;
  for (const slot of openSlots) {
    if (!best || sortValue(slot) >= sortValue(best)) best = slot;
  }
  return best;
}

function isAutoReserveTarget(targetText) {
  return config.autoReserve && config.autoReserveTexts.some(t => targetText.includes(t));
}

/** 確認画面に、選んだ枠の開催日と開始時間が表示されているか（表記ゆれに備えて数値で照合） */
function confirmMatches(body, slot) {
  const day = parseDay(slot.day);
  const time = parseTime(slot.time);
  if (!day) return false;
  const pad = n => String(n).padStart(2, '0');
  const dayPatterns = [
    `${day.y}/${pad(day.m)}/${pad(day.d)}`, `${day.y}/${day.m}/${day.d}`,
    `${day.y}年${pad(day.m)}月${pad(day.d)}日`, `${day.y}年${day.m}月${day.d}日`,
    `${day.m}月${day.d}日`, `${pad(day.m)}月${pad(day.d)}日`
  ];
  const compact = body.replace(/\s+/g, '');
  const dayOk = dayPatterns.some(p => compact.includes(p));
  const timeOk = !time || compact.includes(`${pad(time.h)}:${pad(time.min)}`) || compact.includes(`${time.h}:${pad(time.min)}`);
  return dayOk && timeOk;
}

async function saveReserveArtifacts(page, label) {
  // 予約まわりは SAVE_DEBUG に関係なく必ず残す
  const dir = path.join(config.logsDir, 'reserve');
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${label}`);
  fs.writeFileSync(`${base}.html`, await page.content().catch(() => ''), 'utf8');
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => null);
  log(`[reserve] saved ${base}.png/html`);
}

/** 確認画面で押す「予約申し込み」ボタンを探す */
async function findSubmitButton(page) {
  for (const text of config.submitButtonTexts) {
    const candidates = page.locator('input[type="button"], input[type="submit"], button, a')
      .filter({ hasNotText: '戻る' });
    const count = await candidates.count();
    for (let i = 0; i < count; i += 1) {
      const el = candidates.nth(i);
      const label = ((await el.getAttribute('value').catch(() => '')) || (await el.innerText().catch(() => ''))).replace(/\s+/g, '');
      if (label.includes(text) && !label.includes('戻る') && await el.isVisible().catch(() => false)) return { el, label };
    }
  }
  return null;
}

/**
 * 日程選択画面の該当日程の「予約」→ 確認画面 →「予約申し込み」の順で予約する。
 * 戻り値の status は reserved / failed / dry-run。
 */
async function reserveSlot(page, slot) {
  log(`[reserve] target: ${slot.day} ${slot.time} ${slot.place} (eventdayno=${slot.eventDayNo})`);

  // 日程選択画面を開き直す（最新の状態で押すため）
  const opened = await openTarget(page, slot.program);
  if (opened.state !== 'day-select') return { status: 'failed', message: `日程選択画面を開けませんでした（${opened.state}）` };

  const button = page.locator(`input[onclick*="jsSubmit('${slot.eventDayNo}')"], input[onclick*="jsSubmit(${slot.eventDayNo})"]`).first();
  if (!slot.eventDayNo || !(await button.count())) {
    return { status: 'failed', message: '日程選択画面に対象日程の「予約」ボタンが見つかりませんでした（直前に満席になった可能性があります）' };
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    button.click()
  ]);
  await settle(page, 1500);

  const confirmBody = await bodyText(page);
  const submit = await findSubmitButton(page);
  if (!submit) {
    await saveReserveArtifacts(page, 'no_submit_button');
    return { status: 'failed', message: `確認画面で「予約申し込み」ボタンが見つかりませんでした（URL: ${page.url()}）` };
  }
  if (!confirmMatches(confirmBody, slot)) {
    await saveReserveArtifacts(page, 'confirm_mismatch');
    return { status: 'failed', message: '確認画面の日時が選んだ日程と一致しないため、予約を中止しました' };
  }

  if (config.autoReserveDryRun) {
    await saveReserveArtifacts(page, 'dry_run_confirm_page');
    log('[reserve] AUTO_RESERVE_DRY_RUN=true. 「予約申し込み」は押さずに終了します。');
    return { status: 'dry-run', message: `確認画面まで進みました（「${submit.label}」ボタンを確認。AUTO_RESERVE_DRY_RUN のため押していません）` };
  }

  log(`[reserve] clicking ${submit.label}`);
  page.__acceptSubmitConfirm = true;
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
      submit.el.click()
    ]);
  } finally {
    page.__acceptSubmitConfirm = false;
  }
  await settle(page, 2000);
  await saveReserveArtifacts(page, 'after_submit');

  const after = await bodyText(page);
  const successText = config.reserveSuccessTexts.find(t => after.includes(t));
  const stillConfirm = Boolean(await findSubmitButton(page));
  if (successText && !stillConfirm) {
    return { status: 'reserved', message: `画面に「${successText}」と表示` };
  }

  warn('[reserve] could not confirm reservation result');
  return { status: 'failed', message: `予約完了を確認できませんでした。マイページで予約状況を確認してください（画面: ${after.slice(0, 80)}）` };
}

module.exports = {
  installDialogHandler,
  isAutoReserveTarget,
  alreadyReserved,
  failureAlreadyRecorded,
  recordAttempt,
  pickLastSlot,
  reserveSlot
};
