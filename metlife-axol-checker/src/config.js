const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Please check .env`);
  return value;
}

function bool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return ['true', '1', 'yes', 'y', 'on'].includes(String(raw).toLowerCase());
}

function num(name, defaultValue) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

const config = {
  axolId: required('AXOL_ID'),
  axolPassword: required('AXOL_PASSWORD'),
  discordWebhookUrl: required('DISCORD_WEBHOOK_URL'),

  // ログイン → トップ → 応募フォーム → ③アクチュアリー応募画面、の順で操作する。
  loginUrl: process.env.AXOL_LOGIN_URL || 'https://axol.jp/zw/s/metlife_28/mypage/login',
  topUrl: process.env.AXOL_TOP_URL || 'https://axol.jp/zw/s/metlife_28/mypage/top',
  formUrl: process.env.AXOL_FORM_URL || 'https://axol.jp/zw/s/metlife_28/mypage/form',
  targetSelectUrl: process.env.AXOL_TARGET_SELECT_URL || 'https://axol.jp/zw/s/metlife_28/mypage/form/3/select',
  targetProgramTitle: process.env.TARGET_PROGRAM_TITLE || '③ 専門職 アクチュアリー 仕事体験（選考なし）',

  headless: bool('HEADLESS', true),
  autoSleep: bool('AUTO_SLEEP', false),
  saveDebugArtifacts: bool('SAVE_DEBUG_ARTIFACTS', false),
  checkIntervalMinutes: num('CHECK_INTERVAL_MINUTES', 15),
  notifiedStorePath: process.env.NOTIFIED_STORE_PATH || './data/notified_slots.json',

  closedStatuses: ['満席', '受付終了'],

  // この文字列を見つけたら明示的に空き扱い。未知ステータスも通知対象にするので保険として使用。
  openStatusKeywords: ['募集中', '受付中', '受付可能', '応募可能', '予約可能', '空席', '空き', '残席'],

  // true: 「満席」「受付終了」以外なら通知対象にする。
  notifyUnknownOpenStatus: true,

  browserUserAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

module.exports = { config };
