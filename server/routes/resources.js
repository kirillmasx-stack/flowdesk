// server/routes/resources.js
const express = require('express');
const db      = require('../db');
const auth    = require('../middleware/auth');
const { tlOnly } = require('../middleware/auth');
const router  = express.Router();

router.get('/', auth, async (req, res) => {
  const rows = req.user.role === 'teamlead'
    ? await db.all('SELECT * FROM resources ORDER BY date DESC')
    : await db.all('SELECT * FROM resources WHERE buyer_id=$1 ORDER BY date DESC', [req.user.id]);
  res.json(rows);
});

router.post('/', auth, tlOnly, async (req, res) => {
  const { buyer_id, type, platform, qty, status, note } = req.body;
  const id = 'r-' + Date.now();
  const row = await db.get(
    'INSERT INTO resources (id,buyer_id,type,platform,qty,status,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [id, buyer_id, type, platform, parseInt(qty)||0, status||'issued', note||'']
  );
  res.json(row);
});

router.patch('/:id', auth, tlOnly, async (req, res) => {
  const { status, note, qty } = req.body;
  const sets = []; const vals = []; let i = 1;
  if (status)         { sets.push(`status=$${i++}`); vals.push(status); }
  if (note !== undefined) { sets.push(`note=$${i++}`);   vals.push(note); }
  if (qty !== undefined)  { sets.push(`qty=$${i++}`);    vals.push(parseInt(qty)); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  const row = await db.get(`UPDATE resources SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, vals);
  res.json(row);
});

router.delete('/:id', auth, tlOnly, async (req, res) => {
  await db.run('DELETE FROM resources WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
