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
  snarId: required('SNAR_ID'),
  snarPassword: required('SNAR_PASSWORD'),
  // inspect（レイアウト確認）だけなら Webhook は不要
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  // Slack の Incoming Webhook URL。Discord と両方設定すると両方へ送る（GitHub Actions では Slack のみ想定）
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',

  loginUrl: process.env.SNAR_LOGIN_URL || 'https://cyberagent.snar.jp/login.aspx',
  companyName: process.env.COMPANY_NAME || 'サイバーエージェント',
  afterLoginWaitMs: Number(process.env.AFTER_LOGIN_WAIT_MS || 2000),

  // 監視対象。マイページトップの左メニューで、この文字列を含むリンクの予約画面を確認する（カンマ区切り）。
  // 本選考を含むリンクがある場合だけ確認する（無ければ何もしない）。予約画面の構造は従来の2次選考（mypage/seminar.aspx）と同じと仮定。
  // 以前の対象リンク名: 「【内定直結型インターンシップ選考】2次選考のご予約・確認はこちら」
  // 動作確認時は、現在予約受付中の別イベント名の一部（例: 企画書の作り方講座）を指定すると通知まで試せる。
  targetMenuTexts: listEnv('TARGET_MENU_TEXTS', ['本選考']),

  // 予約画面（mypage/seminar.aspx）の日程表は1ページに収まらないとページ送りになる。無限ループ防止の上限。
  maxPages: Number(process.env.MAX_PAGES || 20),

  // 自動予約。対象の予約画面に空き枠が出たら、一番最後（開催日時が最も遅い）の日程を予約する。
  // 対象は AUTO_RESERVE_MENU_TEXTS を含む予約画面のみ（動作確認用に TARGET_MENU_TEXTS で別イベントを見ても、そちらは予約しない）。
  autoReserve: boolEnv('AUTO_RESERVE', true),
  autoReserveMenuTexts: listEnv('AUTO_RESERVE_MENU_TEXTS', ['本選考']),
  // true: 予約確認画面（「この日程に予約しますか？」）まで進んで内容を確かめ、「予約する」は押さずに終える（動作確認用）
  autoReserveDryRun: boolEnv('AUTO_RESERVE_DRY_RUN', false),
  reservedStorePath: path.resolve(process.cwd(), 'data', 'reserved.json'),
  // 「予約する」を押した後、確認文「この日程に予約しますか？」が消え、かつこの文言か「予約をキャンセル」ボタン（#lkb_Cancel）が
  // 出ていれば予約完了とみなす。完了画面は未確認のため広めに取る。
  // （イベント概要の注意書きに「予約をキャンセル」という文言が含まれるため、その文言自体は完了判定に使わない）
  reserveSuccessTexts: ['予約が完了', '予約を完了', '予約を受け付け', '予約しました', '予約完了', '予約済'],

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

  // 日程表（table#grv_EventList）の「予約状況」列。実画面（2026-10 確認）では
  //   空き : <a class="accept">予約受付中</a>
  //   満席 : <a class="accept"></a><span class="over">満　席</span>
  // 比較は空白（全角含む）を除去してから行う。
  closedStatuses: ['満席', '受付終了', '締切', '終了', '予約済', 'キャンセル', '変更'],
  openStatusKeywords: ['予約受付中', '受付中', '空席', '残りわずか', '残席'],

  // true: 上記どちらにも当てはまらない未知の文言でも、予約リンクに文字があれば予約可として通知する
  notifyUnknownOpenStatus: true
};

module.exports = { config };
