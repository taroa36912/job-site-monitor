const { config } = require('./config');

const DISCORD_LIMIT = 1900;

function slotLine(slot) {
  const parts = [`${slot.day} ${slot.time}`.trim() || slot.rawText.slice(0, 60)];
  if (slot.place) parts.push(slot.place);
  if (slot.status) parts.push(`[${slot.status}]`);
  return `・${parts.join(' / ')}`;
}

function buildResultBlock(result, { onlyNewKeys } = {}) {
  const { program, openSlots, slots } = result;
  const lines = [
    `**■ ${program.keyword}：${program.title}**`,
    `URL: ${program.url || config.baseUrl + config.formListPath}`
  ];

  if (!result.reservable) {
    lines.push(`状態: 予約不可（${result.reason || '不明'}）`);
    return lines.join('\n');
  }

  if (!slots.length) {
    lines.push('状態: 予約ボタンは押せますが、日程を解析できませんでした。マイページで直接確認してください。');
    return lines.join('\n');
  }

  lines.push(`予約可能な日程: ${openSlots.length}件 / 全${slots.length}件`);
  for (const slot of openSlots) {
    const isNew = onlyNewKeys && onlyNewKeys.has(slot.key);
    lines.push(`${slotLine(slot)}${isNew ? ' 🆕' : ''}`);
  }
  return lines.join('\n');
}

function chunk(content) {
  const chunks = [];
  let current = '';
  for (const line of content.split('\n')) {
    if (current.length + line.length + 1 > DISCORD_LIMIT && current) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Discord 用の文面（**太字** / @everyone）を Slack の mrkdwn（*太字* / <!channel>）に変換する
function toSlackText(content) {
  return content.replace(/@everyone/g, '<!channel>').replace(/\*\*(.+?)\*\*/g, '*$1*');
}

async function postWebhook(label, url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} notification failed: ${res.status} ${body}`);
  }
}

// DISCORD_WEBHOOK_URL / SLACK_WEBHOOK_URL のうち設定されているもの（両方なら両方）へ送る
async function postDiscord(content) {
  if (!config.discordWebhookUrl && !config.slackWebhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL or SLACK_WEBHOOK_URL is not set. Please check .env');
  }

  for (const part of chunk(content)) {
    if (config.discordWebhookUrl) await postWebhook('Discord', config.discordWebhookUrl, { content: part });
    if (config.slackWebhookUrl) await postWebhook('Slack', config.slackWebhookUrl, { text: toSlackText(part) });
  }
}

/** 新たに予約可能になった枠があるプログラムについて、予約可能日程の一覧を通知する。 */
async function sendDiscordNotification(results, newKeys) {
  if (!results.length) return;
  const labels = results.map(r => r.program.keyword).join('・');
  const content = [
    '@everyone',
    `**${config.companyName}（${labels}）で予約可能な日程を検知しました**`,
    '',
    results.map(r => buildResultBlock(r, { onlyNewKeys: newKeys })).join('\n\n')
  ].join('\n');
  await postDiscord(content);
}

async function sendDiscordDebugNotification(results, note) {
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const content = [
    `**[DEBUG] ${config.companyName} AXOL checker 実行通知**`,
    `実行時刻: ${now}`,
    note ? `メモ: ${note}` : '',
    '',
    results.map(r => buildResultBlock(r)).join('\n\n') || '対象プログラムなし'
  ].filter(line => line !== null).join('\n');
  await postDiscord(content);
}

module.exports = { sendDiscordNotification, sendDiscordDebugNotification };
