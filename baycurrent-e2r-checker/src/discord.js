const { config } = require('./config');

const DISCORD_LIMIT = 1900;

function slotLine(slot) {
  const parts = [`${slot.day} ${slot.time}`.trim()];
  if (slot.place) parts.push(slot.place);
  if (slot.status) parts.push(`[${slot.status}]`);
  return `・${parts.join(' / ')}`;
}

function buildResultBlock(result, { newKeys } = {}) {
  const { program, slots, openSlots } = result;
  const lines = [`**■ ${program.title}**`];

  if (result.error) {
    lines.push(`状態: 確認できませんでした（${result.error}）`);
    return lines.join('\n');
  }
  if (result.reserved) {
    lines.push('状態: 予約中の日程があります');
    return lines.join('\n');
  }

  lines.push(`予約可能な日程: ${openSlots.length}件 / 全${slots.length}件`);
  for (const slot of openSlots) {
    lines.push(`${slotLine(slot)}${newKeys && newKeys.has(slot.key) ? ' 🆕' : ''}`);
  }
  lines.push(`予約: ${config.loginUrl} にログイン → 選考予約 →「${program.menuText || '日程ページ'}」`);
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

/** 新たに予約可能になった枠がある選考会について、予約可能日程の一覧を通知する。 */
async function sendDiscordNotification(results, newKeys) {
  if (!results.length) return;
  const content = [
    '@everyone',
    `**${config.companyName}で予約可能な日程を検知しました**`,
    '',
    results.map(r => buildResultBlock(r, { newKeys })).join('\n\n')
  ].join('\n');
  await postDiscord(content);
}

async function sendDiscordDebugNotification(results, note) {
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const content = [
    `**[DEBUG] ${config.companyName} マイページ checker 実行通知**`,
    `実行時刻: ${now}`,
    note ? `メモ: ${note}` : '',
    '',
    results.map(r => buildResultBlock(r)).join('\n\n') || '対象の選考会なし'
  ].join('\n');
  await postDiscord(content);
}

module.exports = { sendDiscordNotification, sendDiscordDebugNotification };
