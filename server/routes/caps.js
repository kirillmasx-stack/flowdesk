// server/routes/caps.js
const express = require('express');
const db      = require('../db');
const auth    = require('../middleware/auth');
const { tlOnly } = require('../middleware/auth');
const router  = express.Router();

router.get('/', auth, async (req, res) => {
  const rows = req.user.role === 'teamlead'
    ? await db.all('SELECT * FROM caps ORDER BY created_at DESC')
    : await db.all('SELECT * FROM caps WHERE buyer_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(rows);
});

router.post('/', auth, tlOnly, async (req, res) => {
  const { buyer_id, campaign_name, daily } = req.body;
  if (!campaign_name || !daily) return res.status(400).json({ error: 'Missing fields' });
  const id = 'c-' + Date.now();
  const cap = await db.get(
    'INSERT INTO caps (id,buyer_id,campaign_name,daily,current) VALUES ($1,$2,$3,$4,0) RETURNING *',
    [id, buyer_id || null, campaign_name, parseInt(daily)]
  );
  res.json(cap);
});

router.patch('/:id', auth, tlOnly, async (req, res) => {
  const { campaign_name, daily, current } = req.body;
  const sets = []; const vals = []; let i = 1;
  if (campaign_name !== undefined) { sets.push(`campaign_name=$${i++}`); vals.push(campaign_name); }
  if (daily !== undefined)         { sets.push(`daily=$${i++}`);         vals.push(parseInt(daily)); }
  if (current !== undefined)       { sets.push(`current=$${i++}`);       vals.push(parseInt(current)); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  sets.push(`updated_at=NOW()`);
  vals.push(req.params.id);
  const cap = await db.get(`UPDATE caps SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, vals);
  res.json(cap);
});

router.delete('/:id', auth, tlOnly, async (req, res) => {
  await db.run('DELETE FROM caps WHERE id=$1', [req.params.id]);
  await db.run('DELETE FROM cap_alerts_sent WHERE cap_id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/bulk-update', auth, tlOnly, async (req, res) => {
  const { updates } = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates must be array' });
  await Promise.all(updates.map(u =>
    db.run('UPDATE caps SET current=$1, updated_at=NOW() WHERE id=$2', [u.current, u.id])
  ));
  res.json({ updated: updates.length });
});

module.exports = router;
