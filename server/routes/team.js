// server/routes/team.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const auth    = require('../middleware/auth');
const { tlOnly } = require('../middleware/auth');
const router  = express.Router();
const safe = ({ pass_hash, ...u }) => u;

router.get('/users', auth, async (req, res) => {
  const users = await db.all('SELECT * FROM users ORDER BY created_at ASC');
  res.json(users.map(safe));
});

router.patch('/users/:id', auth, tlOnly, async (req, res) => {
  try {
    const { name, login, telegram, role, team, status, parent_id, pass } = req.body;
    const sets = []; const vals = [];
    let i = 1;
    if (name)      { sets.push(`name=$${i++}`);      vals.push(name); }
    if (login)     { sets.push(`login=$${i++}`);     vals.push(login.toLowerCase()); }
    if (telegram !== undefined) { sets.push(`telegram=$${i++}`); vals.push(telegram); }
    if (role)      { sets.push(`role=$${i++}`);      vals.push(role); }
    if (team)      { sets.push(`team=$${i++}`);      vals.push(team); }
    if (status)    { sets.push(`status=$${i++}`);    vals.push(status); }
    if (parent_id !== undefined) { sets.push(`parent_id=$${i++}`); vals.push(parent_id || null); }
    if (pass)      { sets.push(`pass_hash=$${i++}`); vals.push(await bcrypt.hash(pass, 10)); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const user = await db.get(
      `UPDATE users SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, vals
    );
    res.json(safe(user));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/invites', auth, tlOnly, async (req, res) => {
  const rows = await db.all('SELECT * FROM invites ORDER BY created_at DESC');
  res.json(rows);
});

router.post('/invites', auth, tlOnly, async (req, res) => {
  const { role, parent_id } = req.body;
  if (!role) return res.status(400).json({ error: 'role required' });
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const token = 'inv-' + Array.from({length:12}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  const inv = await db.get(
    'INSERT INTO invites (token,role,parent_id,created_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [token, role, parent_id || null, req.user.id]
  );
  res.json(inv);
});

router.delete('/invites/:token', auth, tlOnly, async (req, res) => {
  await db.run('DELETE FROM invites WHERE token=$1 AND used=FALSE', [req.params.token]);
  res.json({ ok: true });
});

router.get('/invites/validate/:token', async (req, res) => {
  const inv = await db.get('SELECT * FROM invites WHERE token=$1 AND used=FALSE', [req.params.token]);
  if (!inv) return res.status(404).json({ error: 'Token not found or already used' });
  const parent = inv.parent_id
    ? await db.get('SELECT name FROM users WHERE id=$1', [inv.parent_id])
    : null;
  res.json({ ...inv, parentName: parent?.name || null });
});

module.exports = router;
