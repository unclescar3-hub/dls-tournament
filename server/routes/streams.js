const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');

// Get all live/upcoming streams
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, t.name as tournament_name, t.arena FROM streams s
       JOIN tournaments t ON t.id = s.tournament_id
       ORDER BY s.is_live DESC, s.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Player submits a stream link
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { tournament_id, title, platform, stream_url } = req.body;
    if (!tournament_id || !title || !stream_url) return res.status(400).json({ error: 'Missing fields' });
    const allowed_platforms = ['youtube', 'twitch', 'tiktok', 'facebook', 'internal', 'other'];
    const plat = allowed_platforms.includes(platform) ? platform : 'other';
    const result = await pool.query(
      'INSERT INTO streams (tournament_id, title, platform, stream_url) VALUES ($1,$2,$3,$4) RETURNING *',
      [tournament_id, title, plat, stream_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: set a stream live
router.patch('/:id/live', adminMiddleware, async (req, res) => {
  try {
    const { is_live } = req.body;
    const result = await pool.query(
      'UPDATE streams SET is_live=$1 WHERE id=$2 RETURNING *',
      [is_live, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete a stream
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM streams WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
