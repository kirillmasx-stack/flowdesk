// server/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const router  = express.Router();

const sign = (user) => jwt.sign(
  { id: user.id, role: user.role, name: user.name },
  process.env.JWT_SECRET || 'dev-secret',
  { expiresIn: '30d' }
);
const safe = ({ pass_hash, ...u }) => u;

// First-run check
router.get('/status', async (req, res) => {
  try {
    const u = await db.get("SELECT id FROM users WHERE role='teamlead' LIMIT 1");
    res.json({ hasTeamLead: !!u });
  } catch { res.json({ hasTeamLead: false }); }
});

// Register teamlead (first run only)
router.post('/register-teamlead', async (req, res) => {
  try {
    const existing = await db.get("SELECT id FROM users WHERE role='teamlead' LIMIT 1");
    if (existing) return res.status(409).json({ error: 'Team already exists' });
    const { name, email, pass, telegram } = req.body;
    if (!name || !email || !pass) return res.status(400).json({ error: 'Missing fields' });
    if (pass.length < 6) return res.status(400).json({ error: 'Password too short' });
    const passHash = await bcrypt.hash(pass, 10);
    const id = 'tl-' + Date.now();
    await db.run(
      `INSERT INTO users (id,name,login,pass_hash,email,telegram,role,status)
       VALUES ($1,$2,$3,$4,$5,$6,'teamlead','active')`,
      [id, name.trim(), email.trim().toLowerCase(), passHash,
       email.trim().toLowerCase(), telegram || '']
    );
    const user = await db.get('SELECT * FROM users WHERE id=$1', [id]);
    res.json({ token: sign(user), user: safe(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already taken' });
    res.status(500).json({ error: e.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { login, pass } = req.body;
    const user = await db.get(
      "SELECT * FROM users WHERE (login=$1 OR email=$1) AND status='active'",
      [login]
    );
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    const ok = await bcrypt.compare(pass, user.pass_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });
    res.json({ token: sign(user), user: safe(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Register via invite
router.post('/register', async (req, res) => {
  try {
    const { token, name, login, pass, telegram } = req.body;
    const invite = await db.get(
      'SELECT * FROM invites WHERE token=$1 AND used=FALSE', [token]
    );
    if (!invite) return res.status(400).json({ error: 'Токен не найден или уже использован' });
    if (pass.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
    const passHash = await bcrypt.hash(pass, 10);
    const id = (invite.role === 'buyer' ? 'b-' : 'a-') + Date.now();
    await db.run(
      `INSERT INTO users (id,name,login,pass_hash,telegram,role,parent_id,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')`,
      [id, name.trim(), login.trim().toLowerCase(), passHash,
       telegram || '', invite.role, invite.parent_id]
    );
    await db.run(
      'UPDATE invites SET used=TRUE, used_by=$1, used_at=NOW() WHERE token=$2',
      [id, token]
    );
    const user = await db.get('SELECT * FROM users WHERE id=$1', [id]);
    res.json({ token: sign(user), user: safe(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Логин уже занят' });
    res.status(500).json({ error: e.message });
  }
});

// Me
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(safe(user));
});

// Validate invite token (for register form)
router.get('/invite/:token', async (req, res) => {
  const inv = await db.get(
    'SELECT * FROM invites WHERE token=$1 AND used=FALSE', [req.params.token]
  );
  if (!inv) return res.status(404).json({ error: 'Token not found or used' });
  const parent = inv.parent_id
    ? await db.get('SELECT name FROM users WHERE id=$1', [inv.parent_id])
    : null;
  res.json({ ...inv, parentName: parent?.name || null });
});

module.exports = router;
