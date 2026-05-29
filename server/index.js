// server/index.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_URL ? [process.env.CLIENT_URL] : true,
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/team',      require('./routes/team'));
app.use('/api/caps',      require('./routes/caps'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/keitaro',   require('./routes/keitaro'));
app.use('/api/bot',       require('./routes/bot'));
app.get('/api/health',    (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Serve built React
const distPath = path.join(__dirname, '../client/dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── Run migration if needed, then start ──────────────────────────────────────
async function main() {
  // Run migration on start if env flag set OR always (idempotent)
  try {
    console.log('Running database migration...');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, login TEXT NOT NULL UNIQUE,
        pass_hash TEXT NOT NULL, email TEXT, telegram TEXT,
        role TEXT NOT NULL CHECK(role IN ('teamlead','buyer','assistant')),
        team TEXT DEFAULT 'Alpha', parent_id TEXT REFERENCES users(id),
        status TEXT DEFAULT 'active', registered DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS invites (
        token TEXT PRIMARY KEY, role TEXT NOT NULL, parent_id TEXT REFERENCES users(id),
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        used BOOLEAN DEFAULT FALSE, used_by TEXT REFERENCES users(id), used_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS caps (
        id TEXT PRIMARY KEY, buyer_id TEXT REFERENCES users(id),
        campaign_name TEXT NOT NULL, daily INTEGER NOT NULL DEFAULT 0,
        current INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY, buyer_id TEXT REFERENCES users(id),
        type TEXT NOT NULL, platform TEXT, qty INTEGER DEFAULT 0,
        status TEXT DEFAULT 'issued', note TEXT,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS campaign_stats (
        id SERIAL PRIMARY KEY, date DATE NOT NULL DEFAULT CURRENT_DATE,
        campaign_name TEXT NOT NULL, geo TEXT, offer_name TEXT, offer_id TEXT,
        source TEXT, landing_sign TEXT, buyer_info TEXT, antic_id TEXT, buyer_name TEXT,
        clicks INTEGER DEFAULT 0, conversions INTEGER DEFAULT 0,
        revenue NUMERIC(12,2) DEFAULT 0, spend NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(date, campaign_name)
      );
      CREATE TABLE IF NOT EXISTS keitaro_sync (
        id SERIAL PRIMARY KEY, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        campaigns TEXT NOT NULL, status TEXT DEFAULT 'ok', error_msg TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cap_alerts_sent (
        cap_id TEXT NOT NULL, threshold INTEGER NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (cap_id, threshold)
      );
      CREATE INDEX IF NOT EXISTS idx_caps_buyer ON caps(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_resources_buyer ON resources(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_stats_date ON campaign_stats(date);
      CREATE INDEX IF NOT EXISTS idx_stats_offer ON campaign_stats(offer_id);
      CREATE INDEX IF NOT EXISTS idx_stats_buyer ON campaign_stats(buyer_name);
    `);
    client.release();
    await pool.end();
    console.log('✅ Database migration complete');
  } catch (e) {
    console.error('Migration error (continuing anyway):', e.message);
  }

  // Start server
  app.listen(PORT, () => {
    console.log(`✅ FlowDesk running on port ${PORT}`);
    startServices().catch(e => console.error('Service startup error:', e.message));
  });
}

async function startServices() {
  const db  = require('./db');
  const tg  = require('./services/telegram');
  const ks  = require('./services/keitaro');

  const token  = process.env.TELEGRAM_BOT_TOKEN || await tg.getSetting('bot_token').catch(() => '');
  const botOn  = process.env.TELEGRAM_BOT_ENABLED === 'true'
    || await tg.getSetting('bot_enabled').catch(() => 'false') === 'true';
  if (token && botOn) tg.startBot(token);

  if (process.env.KEITARO_URL && process.env.KEITARO_API_KEY) {
    const row = await db.get("SELECT value FROM settings WHERE key='keitaro_sync_interval'").catch(() => null);
    ks.startAutoSync(row ? parseInt(row.value) : 15);
  }
}

main();
