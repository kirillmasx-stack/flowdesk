// server/routes/keitaro.js
const express   = require('express');
const db        = require('../db');
const auth      = require('../middleware/auth');
const { tlOnly }= require('../middleware/auth');
const kService  = require('../services/keitaro');
const router    = express.Router();

// ── POST /api/keitaro/sync ─────────────────────────────────
// Manual sync — also triggers auto-sync restart with new interval
router.post('/sync', auth, tlOnly, async (req, res) => {
  try {
    const interval = req.body.interval || 'today';
    const result   = await kService.sync(interval);
    res.json(result);
  } catch (e) {
    await db.run(
      "INSERT INTO keitaro_sync (campaigns, status, error_msg) VALUES ('[]', 'error', $1)",
      [e.message]
    ).catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/keitaro/history ───────────────────────────────
router.get('/history', auth, tlOnly, async (req, res) => {
  const rows = await db.all(
    'SELECT id, synced_at, status, error_msg, LEFT(campaigns, 500) as campaigns_preview FROM keitaro_sync ORDER BY synced_at DESC LIMIT 20'
  );
  res.json(rows);
});

// ── GET /api/keitaro/config ────────────────────────────────
router.get('/config', auth, tlOnly, async (req, res) => {
  const intervalRow = await db.get("SELECT value FROM settings WHERE key='keitaro_sync_interval'");
  res.json({
    configured: !!(process.env.KEITARO_URL && process.env.KEITARO_API_KEY),
    url:      process.env.KEITARO_URL || '',
    interval: intervalRow ? parseInt(intervalRow.value) : 15,
  });
});

// ── PATCH /api/keitaro/config ──────────────────────────────
// Update sync interval and restart cron
router.patch('/config', auth, tlOnly, async (req, res) => {
  const { interval } = req.body;
  if (interval) {
    await db.run(
      "INSERT INTO settings (key,value) VALUES ('keitaro_sync_interval',$1) ON CONFLICT (key) DO UPDATE SET value=$1",
      [String(interval)]
    );
    if (process.env.KEITARO_URL && process.env.KEITARO_API_KEY) {
      kService.startAutoSync(parseInt(interval));
    }
  }
  res.json({ ok: true });
});

// ── GET /api/keitaro/stats ─────────────────────────────────
// Historical campaign stats from DB (used by offers history page)
router.get('/stats', auth, async (req, res) => {
  const { from, to, geo, source, buyer_name, offer_id } = req.query;

  const conditions = [];
  const vals = [];
  let i = 1;

  if (from)       { conditions.push(`date >= $${i++}`);        vals.push(from); }
  if (to)         { conditions.push(`date <= $${i++}`);        vals.push(to); }
  if (geo)        { conditions.push(`geo = $${i++}`);          vals.push(geo); }
  if (source)     { conditions.push(`source = $${i++}`);       vals.push(source); }
  if (buyer_name) { conditions.push(`buyer_name = $${i++}`);   vals.push(buyer_name); }
  if (offer_id)   { conditions.push(`offer_id = $${i++}`);     vals.push(offer_id); }

  // For buyers: only their campaigns
  if (req.user.role === 'buyer') {
    const user = await db.get('SELECT login FROM users WHERE id=$1', [req.user.id]);
    conditions.push(`buyer_name = $${i++}`);
    vals.push(user?.login || '');
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const rows = await db.all(`
    SELECT
      date, campaign_name, geo, offer_name, offer_id,
      source, landing_sign, buyer_info, antic_id, buyer_name,
      clicks, conversions, revenue, spend,
      CASE WHEN spend > 0 THEN ROUND((revenue - spend) / spend * 100) ELSE 0 END as roi
    FROM campaign_stats
    ${where}
    ORDER BY date DESC, revenue DESC
  `, vals);

  res.json(rows);
});

// ── GET /api/keitaro/stats/aggregate ──────────────────────
// Aggregated stats grouped by offer (for history table)
router.get('/stats/aggregate', auth, async (req, res) => {
  const { from, to, geo, source, buyer_name, search } = req.query;

  const conditions = [];
  const vals = [];
  let i = 1;

  if (from)       { conditions.push(`date >= $${i++}`);      vals.push(from); }
  if (to)         { conditions.push(`date <= $${i++}`);      vals.push(to); }
  if (geo)        { conditions.push(`geo = $${i++}`);        vals.push(geo); }
  if (source)     { conditions.push(`source = $${i++}`);     vals.push(source); }
  if (buyer_name) { conditions.push(`buyer_name = $${i++}`); vals.push(buyer_name); }
  if (search)     { conditions.push(`(offer_name ILIKE $${i} OR offer_id ILIKE $${i++})`); vals.push(`%${search}%`); }

  if (req.user.role === 'buyer') {
    const user = await db.get('SELECT login FROM users WHERE id=$1', [req.user.id]);
    conditions.push(`buyer_name = $${i++}`);
    vals.push(user?.login || '');
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const rows = await db.all(`
    SELECT
      offer_id, offer_name, geo, source, landing_sign,
      buyer_info, antic_id,
      SUM(clicks)       as clicks,
      SUM(conversions)  as leads,
      SUM(revenue)      as revenue,
      SUM(spend)        as spend,
      COUNT(DISTINCT date) as days,
      MIN(date)         as first_date,
      MAX(date)         as last_date,
      CASE WHEN SUM(spend) > 0
        THEN ROUND((SUM(revenue) - SUM(spend)) / SUM(spend) * 100)
        ELSE 0 END       as roi
    FROM campaign_stats
    ${where}
    GROUP BY offer_id, offer_name, geo, source, landing_sign, buyer_info, antic_id
    ORDER BY revenue DESC
  `, vals);

  res.json(rows);
});

// ── GET /api/keitaro/stats/dashboard ──────────────────────
// Dashboard stats: top buyers + totals for date range
router.get('/stats/dashboard', auth, tlOnly, async (req, res) => {
  const { from, to } = req.query;
  const conditions = [];
  const vals = [];
  let i = 1;
  if (from) { conditions.push(`date >= $${i++}`); vals.push(from); }
  if (to)   { conditions.push(`date <= $${i++}`); vals.push(to); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [totals, byBuyer, topOffers] = await Promise.all([
    // Global totals
    db.get(`
      SELECT SUM(clicks) as clicks, SUM(conversions) as conversions,
             SUM(revenue) as revenue, SUM(spend) as spend
      FROM campaign_stats ${where}
    `, vals),
    // Per buyer_name
    db.all(`
      SELECT buyer_name,
             SUM(clicks) as clicks, SUM(conversions) as conversions,
             SUM(revenue) as revenue, SUM(spend) as spend
      FROM campaign_stats ${where}
      GROUP BY buyer_name ORDER BY revenue DESC
    `, vals),
    // Top offers
    db.all(`
      SELECT offer_id, offer_name, geo, source,
             SUM(revenue) as revenue, SUM(spend) as spend,
             SUM(conversions) as leads
      FROM campaign_stats ${where}
      GROUP BY offer_id, offer_name, geo, source
      ORDER BY revenue DESC LIMIT 20
    `, vals),
  ]);

  res.json({ totals, byBuyer, topOffers });
});

module.exports = router;
