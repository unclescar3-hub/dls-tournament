const express = require('express');
const router = express.Router();
const pool = require('../db');
const { adminMiddleware } = require('../auth');
const { logAction } = require('../adminLogger');

// Public: get active non-expired ads
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, body, image_url, link_url, type, position, created_at
      FROM ads
      WHERE active = true AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: get all ads
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ads ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: create ad
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { title, body, image_url, link_url, type, position, expires_at } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
    const result = await pool.query(
      `INSERT INTO ads (title, body, image_url, link_url, type, position, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, body, image_url || null, link_url || null, type || 'banner', position || 'all', expires_at || null, req.user.id]
    );
    logAction(req.user.id, 'POST_ANNOUNCEMENT', { title, type: type || 'banner' }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: toggle active or update ad
router.patch('/:id', adminMiddleware, async (req, res) => {
  try {
    const { title, body, image_url, link_url, type, position, active, expires_at } = req.body;
    const result = await pool.query(
      `UPDATE ads SET
        title      = COALESCE($1, title),
        body       = COALESCE($2, body),
        image_url  = COALESCE($3, image_url),
        link_url   = COALESCE($4, link_url),
        type       = COALESCE($5, type),
        position   = COALESCE($6, position),
        active     = COALESCE($7, active),
        expires_at = COALESCE($8, expires_at)
       WHERE id=$9 RETURNING *`,
      [title ?? null, body ?? null, image_url ?? null, link_url ?? null,
       type ?? null, position ?? null, active ?? null, expires_at ?? null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: delete ad
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM ads WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
