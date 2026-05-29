// server/routes/bot.js
const express = require('express');
const auth    = require('../middleware/auth');
const { tlOnly } = require('../middleware/auth');
const db      = require('../db');
const tg      = require('../services/telegram');
const router  = express.Router();

router.get('/settings', auth, tlOnly, async (req, res) => {
  const rows = await db.all('SELECT key,value FROM settings');
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

router.patch('/settings', auth, tlOnly, async (req, res) => {
  const entries = Object.entries(req.body);
  const allowed = ['bot_token','bot_enabled','alert_at_75','alert_at_90','alert_at_100',
                   'digest_enabled','digest_interval','buyer_top_n','tl_top_n'];
  for (const [key, val] of entries) {
    if (allowed.includes(key) || key.startsWith('chat_id_')) {
      await tg.setSetting(key, String(val));
    }
  }
  if (req.body.bot_token !== undefined || req.body.bot_enabled !== undefined) {
    const token   = await tg.getSetting('bot_token');
    const enabled = await tg.getSetting('bot_enabled') === 'true';
    if (enabled && token) tg.startBot(token);
  }
  res.json({ ok: true });
});

router.post('/test-alert', auth, tlOnly, async (req, res) => {
  try {
    const { chat_id, type } = req.body;
    if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
    const texts = {
      alert:        `🚨 <b>Тест алерта FlowDesk</b>\n\nБот настроен ✅\nchat_id: <code>${chat_id}</code>`,
      buyer_digest: `📊 <b>Тест дайджеста баера</b>\n\nРассылка настроена ✅`,
      tl_digest:    `👁 <b>Тест дайджеста тимлида</b>\n\nРассылка настроена ✅`,
    };
    await tg.send(chat_id, texts[type] || texts.alert);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/send-digest-now', auth, tlOnly, async (req, res) => {
  try { await tg.sendDigests(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
