const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Please check .env`);
  return value;
}

function boolEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function listEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

const config = {
  e2rId: required('E2R_ID'),
  e2rPassword: required('E2R_PASSWORD'),
  // inspect（レイアウト確認）だけなら Webhook は不要
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  // Slack の Incoming Webhook URL。Discord と両方設定すると両方へ送る（GitHub Actions では Slack のみ想定）
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',

  loginUrl: process.env.E2R_LOGIN_URL || 'https://www.e2r.jp/ja/baycurrent2028/',
  origin: 'https://www.e2r.jp',
  companyName: process.env.COMPANY_NAME || 'ベイカレント',
  afterLoginWaitMs: Number(process.env.AFTER_LOGIN_WAIT_MS || 2000),

  // ヘッダーメニュー「選考予約」（a#meeting）の下にあるリンクを順に開き、日程ページの選考会見出し（h3）を探す。
  menuId: process.env.E2R_MENU_ID || 'meeting',

  // 監視対象。選考会の見出しにこの文字列を含むものを確認する（カンマ区切り）。
  // 実画面の見出し: 「【秋冬本選考】東大・京大生限定選考会」（メニュー「【秋冬本選考】1次選考：WEBテスト/ES」のページ内）
  // 動作確認時は別の選考会の見出しの一部（例: 旧帝・一工大限定選考会）を指定できる。
  targetEventTexts: listEnv('TARGET_EVENT_TEXTS', ['東大・京大生限定選考会']),

  headless: boolEnv('HEADLESS', true),
  autoSleep: boolEnv('AUTO_SLEEP', false),
  saveDebug: boolEnv('SAVE_DEBUG', true),
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 15),

  // true にすると、予約可否に関係なく毎回Discordへ実行結果を通知する（疎通確認用）。
  alwaysNotifyDiscord: boolEnv('ALWAYS_NOTIFY_DISCORD', false),

  dataDir: path.resolve(process.cwd(), 'data'),
  logsDir: path.resolve(process.cwd(), 'logs'),
  debugDir: path.resolve(process.cwd(), 'logs', 'debug'),
  inspectDir: path.resolve(process.cwd(), 'logs', 'inspect'),
  notifiedStorePath: path.resolve(process.cwd(), 'data', 'notified_slots.json'),

  // 日程枠（div.schedule）の状態。実画面（2026-10 確認）では空き＝「予約可」＋［予約］ボタン。
  // ページ説明より、予約済みの日程は「予約中」、予約があると他の日程は［予約変更］になる。
  openStatusKeywords: ['予約可', '残りわずか', '空きあり'],
  reservedStatusKeywords: ['予約中'],
  closedStatuses: ['満席', '受付終了', '締切', '終了', '予約不可', 'キャンセル待ち']
};

module.exports = { config };
