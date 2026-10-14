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
  iwebsId: required('IWEBS_ID'),
  iwebsPassword: required('IWEBS_PASSWORD'),
  // inspect（レイアウト確認）だけなら Webhook は不要
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  // Slack の Incoming Webhook URL。Discord と両方設定すると両方へ送る（GitHub Actions では Slack のみ想定）
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',

  baseUrl: process.env.IWEBS_BASE_URL || 'https://mypage.3030.i-webs.jp/simplex2028/',
  companyName: process.env.COMPANY_NAME || 'シンプレクス',
  afterLoginWaitMs: Number(process.env.AFTER_LOGIN_WAIT_MS || 2000),

  // 監視対象。マイページトップの「Step Navi」「Event Information」の見出しに、この文字列を含む項目を確認する（カンマ区切り）。
  // 実画面の見出し: 「人事面談」（その下の「申込/確認」→「予約開始」→ 日程選択）
  // 動作確認時は、現在予約できる別イベントの見出しの一部（例: CEO特別セミナー）を指定すると通知まで試せる。
  targetTexts: listEnv('TARGET_TEXTS', ['人事面談']),

  // 自動予約。対象に空き枠が出たら、一番最後（開催日時が最も遅い）の日程を予約する。
  // 対象は AUTO_RESERVE_TEXTS を含む項目のみ（動作確認用に TARGET_TEXTS で別イベントを見ても、そちらは予約しない）。
  autoReserve: boolEnv('AUTO_RESERVE', true),
  autoReserveTexts: listEnv('AUTO_RESERVE_TEXTS', ['人事面談']),
  // true: 確認画面まで進んで内容を確かめ、「予約申し込み」は押さずに終える（動作確認用）
  autoReserveDryRun: boolEnv('AUTO_RESERVE_DRY_RUN', false),
  reservedStorePath: path.resolve(process.cwd(), 'data', 'reserved.json'),
  // 確認画面で押すボタンの文言（日程選択画面の説明「ご確認後、『予約申し込み』をクリックしてください」より）
  submitButtonTexts: ['予約申し込み', '予約申込', '申し込み', '申込'],
  // 「予約申し込み」を押した後、この文言があれば予約完了とみなす（完了画面は未確認のため広めに取る）
  reserveSuccessTexts: ['予約が完了', '予約を完了', '予約を受け付け', '受け付けました', '申し込みが完了', '申込が完了', '申し込みを受け付け', '完了しました', 'ご予約ありがとう'],

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

  // 申込/確認の先が「予約済み」の画面だと判断する文言（他社 i-webs〔アフラック〕では「申込内容を変更する」）
  reservedPageTexts: ['申込内容を変更', '予約内容を変更', 'キャンセルする', '予約済'],
  // 日程選択画面で日程が無いときの文言
  noDatesTexts: ['申し込み可能な日程がありません', '参加可能な日程が無い'],
  // 予約状況の列。実画面（2026-10 確認）では、空き＝「予約」ボタン（onclick="jsSubmit('<eventdayno>')"）、満席＝<span class="soldout">満席</span>。
  // キャンセル待ち（jsWaitingSubmit）は予約ではないので対象外。
  closedStatuses: ['満席', '受付終了', '締切', '終了', 'キャンセル待ち']
};

module.exports = { config };
