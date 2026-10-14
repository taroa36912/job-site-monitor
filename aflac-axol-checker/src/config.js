const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

function boolEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return String(raw).toLowerCase() === 'true';
}

const config = {
  aflacId: required('AFLAC_ID'),
  aflacPassword: required('AFLAC_PASSWORD'),
  discordWebhookUrl: required('DISCORD_WEBHOOK_URL'),
  loginUrl: process.env.LOGIN_URL || 'https://mypage.3030.i-webs.jp/aflac2028/',
  baseUrl: process.env.BASE_URL || 'https://mypage.3030.i-webs.jp/aflac2028/',
  targetEventText: process.env.TARGET_EVENT_TEXT || 'Aflac Summer 1day インターンシップ',
  headless: boolEnv('HEADLESS', true),
  autoSleep: boolEnv('AUTO_SLEEP', false),
  notifyUnknownOpenStatus: boolEnv('NOTIFY_UNKNOWN_OPEN_STATUS', false),
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 15),
  notifiedStorePath: path.resolve(process.cwd(), 'data/notified_slots.json'),
  screenshotDir: path.resolve(process.cwd(), 'logs'),
  closedStatuses: [
    '満席',
    '受付終了',
    '受付締切',
    '申込終了',
    '予約終了',
    '予約受付終了',
    '終了しました',
    '定員に達しました',
    '選択できません',
    '受付できません',
    '予約できません',
    '締切'
  ],
  openStatusKeywords: [
    '受付中',
    '申込受付中',
    '予約受付中',
    '予約可',
    '申込可',
    '空席',
    '空き',
    '残席',
    '予約可能',
    '申込可能',
    '予約する',
    '選択'
  ]
};

module.exports = { config };
