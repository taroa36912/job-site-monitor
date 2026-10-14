const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { normalizeText } = require('./parser');
const { openMenuLink, goNextPage } = require('./navigator');
const { log, warn } = require('./logger');

const CONFIRM_TEXT = 'この日程に予約しますか';
const ENTRY_DIALOG_TEXT = '日程の予約を行います';

/**
 * ダイアログの扱い。普段はすべてキャンセル（ログアウト確認などで誤操作しない）。
 * 自動予約で「予約する」を押す瞬間だけ、予約の確認ダイアログを1回だけ OK にする。
 */
function installDialogHandler(page) {
  page.on('dialog', dialog => {
    const accept = page.__acceptEntryConfirm && dialog.type() === 'confirm' && dialog.message().includes(ENTRY_DIALOG_TEXT);
    if (accept) page.__acceptEntryConfirm = false;
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

function saveReserved(items) {
  fs.mkdirSync(path.dirname(config.reservedStorePath), { recursive: true });
  fs.writeFileSync(config.reservedStorePath, JSON.stringify(items, null, 2));
}

function recordAttempt(slot, result) {
  const items = loadReserved();
  items.push({ ...slot, result: result.status, message: result.message, at: new Date().toISOString() });
  saveReserved(items);
}

/** すでにこのツールで予約済みの記録があるか */
function alreadyReserved(menuText) {
  return loadReserved().some(item => item.program === menuText && item.result === 'reserved');
}

/** 同じ枠の予約失敗をすでに通知済みか（毎回同じ失敗を通知しないため） */
function failureAlreadyRecorded(slot) {
  return loadReserved().some(item => item.key === slot.key && item.result === 'failed');
}

// 「2026年10月6日(火)」「2026年10月06日(火)」→ { y, m, d }
function parseDay(text) {
  const m = String(text || '').match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!m) return null;
  return { y: m[1] ? Number(m[1]) : new Date().getFullYear(), m: Number(m[2]), d: Number(m[3]) };
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

function isAutoReserveTarget(menuText) {
  return config.autoReserve && config.autoReserveMenuTexts.some(t => menuText.includes(t));
}

/** 予約確認画面に表示された開催日・開始時間が、選んだ枠と一致するか */
function detailMatches(body, slot) {
  const want = parseDay(slot.day);
  const dm = body.match(/開催日\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const tm = body.match(/開催時間\s*(\d{1,2}):(\d{2})/);
  const wantTime = parseTime(slot.time);
  if (!want || !dm) return false;
  const dayOk = Number(dm[1]) === want.y && Number(dm[2]) === want.m && Number(dm[3]) === want.d;
  const timeOk = !wantTime || (tm && Number(tm[1]) === wantTime.h && Number(tm[2]) === wantTime.min);
  return dayOk && Boolean(timeOk);
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

/**
 * 日程表の該当行の「予約受付中」→ 予約確認画面「この日程に予約しますか？」→「予約する」→ 確認ダイアログ OK
 * の順で予約する。戻り値の status は reserved / failed / dry-run。
 */
async function reserveSlot(page, slot) {
  log(`[reserve] target: ${slot.day} ${slot.time} ${slot.place} (page ${slot.pageNo}, ${slot.linkId})`);

  // 日程表を開き直して（1ページ目に戻る）、対象のページまで送る
  await openMenuLink(page, slot.program);
  for (let n = 1; n < slot.pageNo; n += 1) {
    if (!(await goNextPage(page))) return { status: 'failed', message: `日程表の${slot.pageNo}ページ目に移動できませんでした` };
  }

  const link = page.locator(`#${slot.linkId}`);
  if (!slot.linkId || !(await link.count())) {
    return { status: 'failed', message: '日程表に対象の「予約受付中」リンクが見つかりませんでした' };
  }
  const rowText = normalizeText(await link.locator('xpath=ancestor::tr[1]').innerText());
  const rowDay = parseDay(rowText);
  const wantDay = parseDay(slot.day);
  if (!rowDay || !wantDay || rowDay.m !== wantDay.m || rowDay.d !== wantDay.d || !rowText.includes(slot.time)) {
    return { status: 'failed', message: `日程表の行が想定と異なります: ${rowText}` };
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    link.click()
  ]);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(1500);

  const detail = normalizeText(await page.locator('body').innerText());
  const entry = page.locator('#lkb_Entry');
  if (!detail.includes(CONFIRM_TEXT) || !(await entry.isVisible().catch(() => false))) {
    await saveReserveArtifacts(page, 'no_confirm_page');
    return { status: 'failed', message: '予約確認画面（この日程に予約しますか？）が表示されませんでした（直前に満席になった可能性があります）' };
  }
  if (!detailMatches(detail, slot)) {
    await saveReserveArtifacts(page, 'detail_mismatch');
    return { status: 'failed', message: '予約確認画面の開催日時が選んだ日程と一致しないため、予約を中止しました' };
  }

  if (config.autoReserveDryRun) {
    await saveReserveArtifacts(page, 'dry_run_confirm_page');
    log('[reserve] AUTO_RESERVE_DRY_RUN=true. 「予約する」は押さずに終了します。');
    return { status: 'dry-run', message: '予約確認画面まで進みました（AUTO_RESERVE_DRY_RUN のため「予約する」は押していません）' };
  }

  log('[reserve] clicking 予約する');
  page.__acceptEntryConfirm = true;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    entry.click()
  ]);
  page.__acceptEntryConfirm = false;
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(2000);
  await saveReserveArtifacts(page, 'after_entry');

  const after = normalizeText(await page.locator('body').innerText().catch(() => ''));
  const cancelVisible = await page.locator('#lkb_Cancel').isVisible().catch(() => false);
  const successText = config.reserveSuccessTexts.find(t => after.includes(t));
  if (!after.includes(CONFIRM_TEXT) && (successText || cancelVisible)) {
    return { status: 'reserved', message: successText ? `画面に「${successText}」と表示` : '「予約をキャンセル」ボタンが表示' };
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
