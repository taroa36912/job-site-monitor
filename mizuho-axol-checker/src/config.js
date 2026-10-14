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
  axolId: required('AXOL_ID'),
  axolPassword: required('AXOL_PASSWORD'),
  // inspect（レイアウト確認）だけなら Webhook は不要
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  // Slack の Incoming Webhook URL。Discord と両方設定すると両方へ送る（GitHub Actions では Slack のみ想定）
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',

  loginUrl: process.env.AXOL_LOGIN_URL || 'https://axol.jp/zw/s/mizuho-fg_28/mypage/login',
  baseUrl: process.env.AXOL_BASE_URL || 'https://axol.jp/zw/s/mizuho-fg_28/mypage/',
  companyName: process.env.COMPANY_NAME || 'みずほフィナンシャルグループ',

  // 画面遷移先。予約一覧（左メニュー「予約・確認フォーム」）は mypage/form。
  topPath: process.env.TOP_PATH || 'top',
  formListPath: process.env.FORM_LIST_PATH || 'form',
  // 直接遷移に失敗した場合、トップ画面のメニューからこの文字列を含むリンクをクリックする。
  formListMenuTexts: listEnv('FORM_LIST_MENU_TEXTS', ['予約・確認フォーム']),
  navigationRetries: Number(process.env.NAVIGATION_RETRIES || 2),
  afterLoginWaitMs: Number(process.env.AFTER_LOGIN_WAIT_MS || 5000),

  // 監視対象。予約一覧の項目名にこの文字列を含むものを、それぞれ独立に確認する。
  // 動作確認時は、現在予約できる別イベント名を指定すると通知までの流れを試せる。
  targetKeywords: listEnv('TARGET_KEYWORDS', ['クオンツ', 'アクチュアリー']),

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

  // 予約一覧（.event__item）の状態。実画面（2026-10 確認）では次の3通り。
  //   受付中 : 「予約画面へ進む」ボタン（form/<番号>/select へ遷移）
  //   予約済 : 「※…に予約されています。」＋「予約内容を確認する」ボタン（form/<番号>/confirm へ遷移）
  //   受付外 : ボタン無し。「現在、受付可能な日程はありません。」
  entryButtonTexts: ['予約画面へ進む'],
  reservedItemTexts: ['予約内容を確認する', '予約されています'],
  closedItemTexts: ['受付可能な日程はありません', '受付期間外', '受付終了', '締切', '満席'],

  // 日程枠（label.reserve__item）の状態。
  // 受付終了の枠はラジオボタンが無く .item__recep.close「受付終了」、受付中の枠は radio[name=yoyaku_id] と .item__recep.open「受付中」。
  closedStatuses: ['満席', '受付終了', '終了', '締切', '予約済', '受付期間外', '受付前', 'キャンセル待ち終了', '予約できません'],
  openStatusKeywords: ['受付中', '募集中', '受付可能', '予約可能', '空席', '残席', '残りわずか'],

  // true: 上記どちらにも当てはまらない未知の文言でも、ラジオボタンが選べる枠は予約可として通知する
  notifyUnknownOpenStatus: true
};

module.exports = { config };
