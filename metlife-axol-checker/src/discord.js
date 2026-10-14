const { config } = require('./config');

async function sendDiscordNotification(slots) {
  if (!slots.length) return;

  const lines = slots.map(slot => [
    `プログラム: ${slot.programTitle}`,
    `日時: ${slot.day} ${slot.time}`,
    `会場: ${slot.place || '不明'}`,
    `状態: ${slot.status}`,
    `URL: ${config.targetSelectUrl}`
  ].join('\n'));

  const content = [
    '@everyone',
    '**メットライフ生命 アクチュアリー仕事体験で空き枠を検知しました**',
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
