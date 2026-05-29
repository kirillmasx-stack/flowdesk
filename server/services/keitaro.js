// server/services/keitaro.js
// Auto-sync service: pulls data from Keitaro, updates caps, saves history
require('dotenv').config();
const fetch = require('node-fetch');
const db    = require('../db');

// ── Parse campaign name ─────────────────────────────────────────────────────
function parseCampaign(name = '') {
  const p = name.split('|').map(s => s.trim().replace(/\s+/g, ' '));
  return {
    geo:         p[0] || '',
    offerName:   p[1] || name,
    offerId:     p[2] ? p[2].trim() : '',
    source:      p[3] || '',
    landingSign: p[4] || '',
    buyerInfo:   p[5] || '',
    anticId:     p[6] || '',
    buyerName:   p[7] || '',
  };
}

// ── Fetch today's report from Keitaro ───────────────────────────────────────
async function fetchKeitaro(interval = 'today') {
  const kUrl = process.env.KEITARO_URL;
  const kKey = process.env.KEITARO_API_KEY;
  if (!kUrl || !kKey) throw new Error('Keitaro not configured');

  const payload = {
    range:    { interval, timezone: 'UTC' },
    grouping: ['campaign'],
    metrics:  ['clicks', 'conversions', 'revenue', 'cost'],
    filters:  [],
  };

  const resp = await fetch(`${kUrl}/api/v1/report/build`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Api-Key': kKey },
    body:    JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Keitaro HTTP ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return (data.rows || []).map(r => ({
    name:    r.campaign_name || '',
    clicks:  parseInt(r.clicks   || 0),
    conv:    parseInt(r.conversions || 0),
    revenue: parseFloat(r.revenue || 0),
    spend:   parseFloat(r.cost    || 0),
  }));
}

// ── Update cap current values ───────────────────────────────────────────────
async function updateCaps(campaigns) {
  const caps = await db.all('SELECT * FROM caps');
  let updated = 0;

  for (const cap of caps) {
    const parsed = parseCampaign(cap.campaign_name);
    if (!parsed.offerId) continue;

    // Find matching campaign(s) by offerId in name
    const matching = campaigns.filter(c => {
      const cp = parseCampaign(c.name);
      return cp.offerId === parsed.offerId;
    });
    if (!matching.length) continue;

    // Sum conversions across all matching campaigns
    const totalConv = matching.reduce((s, c) => s + c.conv, 0);
    await db.run(
      'UPDATE caps SET current=$1, updated_at=NOW() WHERE id=$2',
      [totalConv, cap.id]
    );
    updated++;
  }
  return updated;
}

// ── Save stats to campaign_stats table ─────────────────────────────────────
async function saveStats(campaigns, date = null) {
  const today = date || new Date().toISOString().split('T')[0];
  let saved = 0;

  for (const c of campaigns) {
    const p = parseCampaign(c.name);
    if (!c.name) continue;

    await db.run(`
      INSERT INTO campaign_stats
        (date, campaign_name, geo, offer_name, offer_id, source, landing_sign, buyer_info, antic_id, buyer_name, clicks, conversions, revenue, spend)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (date, campaign_name)
      DO UPDATE SET
        clicks=$11, conversions=$12, revenue=$13, spend=$14
    `, [
      today, c.name, p.geo, p.offerName, p.offerId,
      p.source, p.landingSign, p.buyerInfo, p.anticId, p.buyerName,
      c.clicks, c.conv, c.revenue, c.spend,
    ]);
    saved++;
  }
  return saved;
}

// ── Full sync: fetch → update caps → save history ──────────────────────────
async function sync(interval = 'today') {
  const campaigns = await fetchKeitaro(interval);

  const [capsUpdated, statsSaved] = await Promise.all([
    updateCaps(campaigns),
    saveStats(campaigns),
  ]);

  // Log sync
  await db.run(
    "INSERT INTO keitaro_sync (campaigns, status) VALUES ($1, 'ok')",
    [JSON.stringify(campaigns)]
  );

  return { campaigns, capsUpdated, statsSaved, synced_at: new Date().toISOString() };
}

// ── Auto-sync cron ──────────────────────────────────────────────────────────
let syncJob = null;

function startAutoSync(intervalMinutes = 15) {
  const cron = require('node-cron');
  if (syncJob) syncJob.stop();

  // Build cron expression from minutes
  let expr;
  if (intervalMinutes < 60) {
    expr = `*/${intervalMinutes} * * * *`;
  } else {
    expr = `0 */${Math.floor(intervalMinutes/60)} * * *`;
  }

  syncJob = cron.schedule(expr, async () => {
    try {
      const result = await sync('today');
      console.log(`[Keitaro] Auto-sync: ${result.campaigns.length} campaigns, ${result.capsUpdated} caps updated`);

      // Check cap alerts after sync
      const tg = require('./telegram');
      await tg.checkAndAlert();
    } catch (e) {
      console.error('[Keitaro] Auto-sync error:', e.message);
      await db.run(
        "INSERT INTO keitaro_sync (campaigns, status, error_msg) VALUES ('[]', 'error', $1)",
        [e.message]
      ).catch(() => {});
    }
  });

  console.log(`✅ Keitaro auto-sync started (every ${intervalMinutes} min)`);
}

function stopAutoSync() {
  if (syncJob) { syncJob.stop(); syncJob = null; }
}

module.exports = { sync, fetchKeitaro, updateCaps, saveStats, parseCampaign, startAutoSync, stopAutoSync };
