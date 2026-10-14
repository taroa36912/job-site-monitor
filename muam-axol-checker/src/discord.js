const { config } = require('./config');

function buildSlotLines(slots) {
  if (!slots.length) return ['検出枠: 0件'];

  return slots.map(slot => [
    `対象: ${slot.eventLabel || '不明'}`,
    `イベント: ${slot.eventTitle || config.targetEventTitle}`,
    `日時: ${slot.day || '不明'} ${slot.time || ''}`.trim(),
    `形式/会場: ${slot.place || '不明'}`,
    `状態: ${slot.status || '不明'}`,
    `URL: ${slot.url || new URL(slot.selectPath || config.onlineSelectPath, config.baseUrl).toString()}`
  ].join('\n'));
}

async function postDiscord(content) {
  const res = await fetch(config.discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord notification failed: ${res.status} ${body}`);
  }
}

async function sendDiscordNotification(slots) {
  if (!slots.length) return;

  const labels = [...new Set(slots.map(slot => slot.eventLabel).filter(Boolean))].join('・') || 'オンライン/対面';
  const content = [
    '@everyone',
    `**三菱UFJアセットマネジメント 5daysサマーインターン（${labels}）で満席以外の枠を検知しました**`,
    '',
    buildSlotLines(slots).join('\n\n---\n\n')
  ].join('\n');

  await postDiscord(content);
}

async function sendDiscordDebugNotification({ slots, openSlots, pageUrl, note }) {
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const content = [
    '**[DEBUG] MUAM AXOL checker 実行通知**',
    `実行時刻: ${now}`,
    `ページURL: ${pageUrl || '不明'}`,
    `総枠数: ${slots.length}`,
    `満席以外判定数: ${openSlots.length}`,
    note ? `メモ: ${note}` : '',
    '',
    buildSlotLines(slots).join('\n\n---\n\n')
  ].filter(Boolean).join('\n');

  await postDiscord(content);
}

module.exports = { sendDiscordNotification, sendDiscordDebugNotification };
