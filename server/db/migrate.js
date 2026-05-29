// server/db/migrate.js — PostgreSQL schema
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        login       TEXT NOT NULL UNIQUE,
        pass_hash   TEXT NOT NULL,
        email       TEXT,
        telegram    TEXT,
        role        TEXT NOT NULL CHECK(role IN ('teamlead','buyer','assistant')),
        team        TEXT DEFAULT 'Alpha',
        parent_id   TEXT REFERENCES users(id),
        status      TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
        registered  DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invites (
        token       TEXT PRIMARY KEY,
        role        TEXT NOT NULL,
        parent_id   TEXT REFERENCES users(id),
        created_by  TEXT NOT NULL REFERENCES users(id),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        used        BOOLEAN DEFAULT FALSE,
        used_by     TEXT REFERENCES users(id),
        used_at     TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS caps (
        id            TEXT PRIMARY KEY,
        buyer_id      TEXT REFERENCES users(id),
        campaign_name TEXT NOT NULL,
        daily         INTEGER NOT NULL DEFAULT 0,
        current       INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS resources (
        id          TEXT PRIMARY KEY,
        buyer_id    TEXT REFERENCES users(id),
        type        TEXT NOT NULL,
        platform    TEXT,
        qty         INTEGER DEFAULT 0,
        status      TEXT DEFAULT 'issued',
        note        TEXT,
        date        DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS keitaro_sync (
        id          SERIAL PRIMARY KEY,
        synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        campaigns   TEXT NOT NULL,
        status      TEXT DEFAULT 'ok',
        error_msg   TEXT
      );

      -- Keitaro daily stats per campaign (for history)
      CREATE TABLE IF NOT EXISTS campaign_stats (
        id            SERIAL PRIMARY KEY,
        date          DATE NOT NULL DEFAULT CURRENT_DATE,
        campaign_name TEXT NOT NULL,
        geo           TEXT,
        offer_name    TEXT,
        offer_id      TEXT,
        source        TEXT,
        landing_sign  TEXT,
        buyer_info    TEXT,
        antic_id      TEXT,
        buyer_name    TEXT,
        clicks        INTEGER DEFAULT 0,
        conversions   INTEGER DEFAULT 0,
        revenue       NUMERIC(12,2) DEFAULT 0,
        spend         NUMERIC(12,2) DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(date, campaign_name)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cap_alerts_sent (
        cap_id      TEXT NOT NULL,
        threshold   INTEGER NOT NULL,
        sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (cap_id, threshold)
      );

      CREATE INDEX IF NOT EXISTS idx_caps_buyer      ON caps(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_resources_buyer ON resources(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_stats_date      ON campaign_stats(date);
      CREATE INDEX IF NOT EXISTS idx_stats_offer     ON campaign_stats(offer_id);
      CREATE INDEX IF NOT EXISTS idx_stats_buyer     ON campaign_stats(buyer_name);
    `);
    console.log('✅ PostgreSQL schema migrated');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error('Migration failed:', e); process.exit(1); });
