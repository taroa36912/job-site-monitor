const { config } = require('./config');

async function sendDiscordNotification(slots) {
  if (!slots.length) return;

  const lines = slots.map(slot => [
    `イベント: ${config.targetEventText}`,
    `日時: ${slot.date || '不明'} ${slot.time || ''}`.trim(),
    `会場: ${slot.place || '不明'}`,
    `状態: ${slot.status || '受付可能候補'}`,
    `URL: ${config.baseUrl}`
  ].join('\n'));

  const content = [
    '@everyone',
    '**アフラック Summer 1day インターンシップで空き枠を検知しました**',
    '',
    lines.join('\n\n---\n\n')
  ].join('\n');

  const response = await fetch(config.discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord notification failed: ${response.status} ${body}`);
  }
}

module.exports = { sendDiscordNotification };
