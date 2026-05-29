// server/services/telegram.js
const db = require('../db');

let bot = null;
let cronJobs = [];

function parseCampaign(name = '') {
  const p = name.split('|').map(s => s.trim().replace(/\s+/g, ' '));
  return { geo: p[0]||'—', offerName: p[1]||name, offerId: p[2]||'—', source: p[3]||'—' };
}

async function getSetting(key, def = '') {
  const row = await db.get('SELECT value FROM settings WHERE key=$1', [key]);
  return row ? row.value : def;
}

async function setSetting(key, value) {
  await db.run(
    'INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
    [key, String(value)]
  );
}

async function send(chatId, text) {
  if (!bot || !chatId) return;
  try { await bot.sendMessage(chatId, text, { parse_mode: 'HTML' }); }
  catch (e) { console.error('[TG] Send error:', e.message); }
}

async function buildCapAlert(cap, pct) {
  const p  = parseCampaign(cap.campaign_name);
  const em = pct >= 100 ? '🔴' : pct >= 90 ? '🚨' : '⚠️';
  const lb = pct >= 100 ? 'ПЕРЕЛИВ' : pct >= 90 ? 'Критично' : 'Скоро';
  const bar = '█'.repeat(Math.floor(Math.min(pct,100)/10)) + '░'.repeat(10-Math.floor(Math.min(pct,100)/10));
  return `${em} <b>${lb} — ${pct}%</b>\n\n🌍 <b>${p.geo}</b> | ${p.offerName} <code>#${p.offerId}</code>\n📊 ${p.source}\n${bar}\n📈 <b>${cap.current}/${cap.daily}</b>`;
}

async function checkAndAlert() {
  const thresholds = [75, 90, 100];
  const tlChatId = await getSetting('chat_id_tl');
  const caps = await db.all('SELECT * FROM caps');
  for (const cap of caps) {
    const pct = cap.daily > 0 ? Math.round(cap.current / cap.daily * 100) : 0;
    for (const t of thresholds) {
      const enabled = await getSetting(`alert_at_${t}`, 'true');
      if (enabled !== 'true' || pct < t) continue;
      const sent = await db.get(
        'SELECT 1 FROM cap_alerts_sent WHERE cap_id=$1 AND threshold=$2', [cap.id, t]
      );
      if (sent) continue;
      if (tlChatId) await send(tlChatId, await buildCapAlert(cap, pct));
      await db.run(
        'INSERT INTO cap_alerts_sent (cap_id,threshold) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [cap.id, t]
      );
    }
    const pct2 = cap.daily > 0 ? Math.round(cap.current / cap.daily * 100) : 0;
    if (pct2 < 50) {
      await db.run('DELETE FROM cap_alerts_sent WHERE cap_id=$1', [cap.id]);
    }
  }
}

async function sendDigests() {
  const tlChatId  = await getSetting('chat_id_tl');
  const tlTopN    = parseInt(await getSetting('tl_top_n', '10'));
  const buyerTopN = parseInt(await getSetting('buyer_top_n', '5'));

  if (tlChatId) {
    const caps = await db.all(
      'SELECT * FROM caps ORDER BY (current::float/NULLIF(daily,0)) DESC NULLS LAST LIMIT $1',
      [tlTopN]
    );
    if (caps.length) {
      const lines = caps.map(c => {
        const pct = c.daily > 0 ? Math.round(c.current/c.daily*100) : 0;
        const p = parseCampaign(c.campaign_name);
        const em = pct>=100?'🔴':pct>=90?'🚨':pct>=75?'⚠️':'✅';
        return `${em} <b>${p.geo} | ${p.offerName}</b>\n   ${c.current}/${c.daily} — <b>${pct}%</b>`;
      }).join('\n\n');
      await send(tlChatId, `👁 <b>Дайджест ТОП ${tlTopN}</b>\n${new Date().toLocaleTimeString('ru-RU')}\n\n${lines}`);
    }
  }

  const buyers = await db.all("SELECT * FROM users WHERE role='buyer' AND status='active'");
  for (const buyer of buyers) {
    const chatId = await getSetting(`chat_id_${buyer.id}`);
    if (!chatId) continue;
    const caps = await db.all(
      'SELECT * FROM caps WHERE buyer_id=$1 ORDER BY (current::float/NULLIF(daily,0)) DESC NULLS LAST LIMIT $2',
      [buyer.id, buyerTopN]
    );
    if (!caps.length) continue;
    const lines = caps.map(c => {
      const pct = c.daily > 0 ? Math.round(c.current/c.daily*100) : 0;
      const p = parseCampaign(c.campaign_name);
      const em = pct>=100?'🔴':pct>=90?'🚨':pct>=75?'⚠️':'✅';
      const bar = '█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10));
      return `${em} <b>${p.geo} | ${p.offerName}</b>\n   ${bar} ${pct}%  (${c.current}/${c.daily})`;
    }).join('\n\n');
    await send(chatId, `📊 <b>Твої капи ТОП ${buyerTopN}</b>\n${new Date().toLocaleString('ru-RU')}\n\n${lines}`);
  }
}

async function startBot(token) {
  if (bot) { try { bot.stopPolling(); } catch {} }
  if (!token) return;
  const TelegramBot = require('node-telegram-bot-api');
  const cron = require('node-cron');
  cronJobs.forEach(j => j.stop());
  cronJobs = [];
  bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start/, msg => {
    bot.sendMessage(msg.chat.id,
      `👋 FlowDesk Bot\n\nТвой <code>chat_id</code>: <b>${msg.chat.id}</b>\n\nОтправь этот ID тимлиду.`,
      { parse_mode: 'HTML' }
    );
  });

  bot.onText(/\/caps/, async msg => {
    const chatId = String(msg.chat.id);
    const rows = await db.all("SELECT key,value FROM settings WHERE key LIKE 'chat_id_%'");
    const entry = rows.find(r => r.value === chatId);
    if (!entry) return bot.sendMessage(chatId, '❌ Не зарегистрирован.');
    const userId = entry.key.replace('chat_id_', '');
    const user = await db.get('SELECT * FROM users WHERE id=$1', [userId]);
    if (!user) return bot.sendMessage(chatId, '❌ Пользователь не найден.');
    await sendDigests();
  });

  cronJobs.push(cron.schedule('*/5 * * * *', () => checkAndAlert().catch(console.error)));
  const interval = parseInt(await getSetting('digest_interval', '60'));
  const expr = interval >= 60 ? '0 * * * *' : `*/${interval} * * * *`;
  cronJobs.push(cron.schedule(expr, () => sendDigests().catch(console.error)));

  console.log('✅ Telegram Bot started');
}

module.exports = { startBot, checkAndAlert, sendDigests, getSetting, setSetting, send };
