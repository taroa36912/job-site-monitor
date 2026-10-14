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

const onlineSelectPath = process.env.ONLINE_SELECT_PATH || 'form/2/select';
const onsiteSelectPath = process.env.ONSITE_SELECT_PATH || 'form/1/select';

const config = {
  axolId: required('AXOL_ID'),
  axolPassword: required('AXOL_PASSWORD'),
  discordWebhookUrl: required('DISCORD_WEBHOOK_URL'),

  loginUrl: process.env.AXOL_LOGIN_URL || 'https://axol.jp/zw/s/am_mufg_28/mypage/login',
  baseUrl: process.env.AXOL_BASE_URL || 'https://axol.jp/zw/s/am_mufg_28/mypage/',
  targetEventTitle: process.env.TARGET_EVENT_TITLE || '【オンライン】5daysサマーインターン',

  // 画面遷移先。クリックで詰まる場合があるため、リンク/ボタンと同じURLへ直接遷移できるようにしています。
  topPath: process.env.TOP_PATH || 'top',
  formListPath: process.env.FORM_LIST_PATH || 'form',
  onlineSelectPath,
  onsiteSelectPath,
  navigationRetries: Number(process.env.NAVIGATION_RETRIES || 2),
  afterLoginWaitMs: Number(process.env.AFTER_LOGIN_WAIT_MS || 5000),

  // 監視対象。オンラインを先に見て、オンラインが満席/空きなしなら対面も確認します。
  eventChecks: [
    {
      key: 'online',
      label: 'オンライン',
      title: process.env.ONLINE_EVENT_TITLE || '【オンライン】5daysサマーインターン　8/24(月)～8/28(金)',
      selectPath: onlineSelectPath,
      listButtonSelector: process.env.ONLINE_BUTTON_SELECTOR || 'button#button2',
      expectedText: ['オンライン', '5daysサマーインターン']
    },
    {
      key: 'onsite',
      label: '対面',
      title: process.env.ONSITE_EVENT_TITLE || '【対面】5daysサマーインターン　8/24(月)～8/28(金)',
      selectPath: onsiteSelectPath,
      listButtonSelector: process.env.ONSITE_BUTTON_SELECTOR || 'button#button1',
      expectedText: ['対面', '5daysサマーインターン']
    }
  ],

  headless: boolEnv('HEADLESS', true),
  autoSleep: boolEnv('AUTO_SLEEP', false),
  saveDebug: boolEnv('SAVE_DEBUG', true),
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 15),

  // true にすると、空き枠がなくても毎回Discordへデバッグ通知します。
  alwaysNotifyDiscord: boolEnv('ALWAYS_NOTIFY_DISCORD', false),

  dataDir: path.resolve(process.cwd(), 'data'),
  logsDir: path.resolve(process.cwd(), 'logs'),
  debugDir: path.resolve(process.cwd(), 'logs', 'debug'),
  notifiedStorePath: path.resolve(process.cwd(), 'data', 'notified_slots.json'),

  closedStatuses: [
    '満席',
    '受付終了',
    '終了',
    '締切',
    '予約済',
    'キャンセル待ち終了'
  ],

  openStatusKeywords: [
    '募集中',
    '受付中',
    '受付可能',
    '予約可能',
    '空席',
    '空き',
    '残席',
    '申込可能',
    '予約する'
  ],

  notifyUnknownOpenStatus: true
};

module.exports = { config };
