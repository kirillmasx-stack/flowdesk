// server/db/index.js — PostgreSQL client for Railway
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Promisified query helper
const db = {
  query:       (text, params) => pool.query(text, params),
  // Mimic better-sqlite3 .get() / .all() / .run() API with async versions
  get:  async (text, params) => { const r = await pool.query(text, params); return r.rows[0] || null; },
  all:  async (text, params) => { const r = await pool.query(text, params); return r.rows; },
  run:  async (text, params) => { const r = await pool.query(text, params); return r; },
};

module.exports = db;
