const express = require('express');
const router = express.Router();
const pool = require('../db');
const { adminMiddleware } = require('../auth');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.username as author FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.pinned DESC, a.created_at DESC LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { title, body, arena, type, pinned } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const result = await pool.query(
      `INSERT INTO announcements (title, body, arena, type, pinned, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, body, arena || null, type || 'news', pinned || false, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/pin', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE announcements SET pinned = NOT pinned WHERE id=$1 RETURNING *`, [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM announcements WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
