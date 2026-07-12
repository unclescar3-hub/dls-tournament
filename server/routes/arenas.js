const express = require('express');
const router = express.Router();
const pool = require('../db');
const { adminMiddleware } = require('../auth');
const { logAction } = require('../adminLogger');

// ── Public: list active arenas ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug, color, description, season_start, season_end FROM arenas WHERE is_active=TRUE ORDER BY created_at ASC'
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: list ALL arenas (active + inactive) ────────────────────────────────
router.get('/all', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM arenas ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: create arena ───────────────────────────────────────────────────────
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { name, slug, color, description, season_start, season_end, is_active } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const result = await pool.query(
      `INSERT INTO arenas (name, slug, color, description, season_start, season_end, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name.trim(), cleanSlug, color || '#00e676', description || null,
       season_start || null, season_end || null, is_active !== false]
    );
    logAction(req.user.id, 'CREATE_ARENA', { name, slug: cleanSlug }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'An arena with that slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: update arena ───────────────────────────────────────────────────────
router.patch('/:id', adminMiddleware, async (req, res) => {
  try {
    const { name, slug, color, description, season_start, season_end, is_active } = req.body;
    const arena = await pool.query('SELECT * FROM arenas WHERE id=$1', [req.params.id]);
    if (!arena.rows.length) return res.status(404).json({ error: 'Arena not found' });
    const a = arena.rows[0];
    const cleanSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '-') : a.slug;
    const result = await pool.query(
      `UPDATE arenas SET
        name=$1, slug=$2, color=$3, description=$4,
        season_start=$5, season_end=$6, is_active=$7
       WHERE id=$8 RETURNING *`,
      [
        name ?? a.name, cleanSlug, color ?? a.color,
        description !== undefined ? description : a.description,
        season_start !== undefined ? (season_start || null) : a.season_start,
        season_end !== undefined ? (season_end || null) : a.season_end,
        is_active !== undefined ? is_active : a.is_active,
        req.params.id
      ]
    );
    logAction(req.user.id, 'UPDATE_ARENA', { id: req.params.id, name: result.rows[0].name }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'An arena with that slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: delete arena ───────────────────────────────────────────────────────
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const arena = await pool.query('SELECT * FROM arenas WHERE id=$1', [req.params.id]);
    if (!arena.rows.length) return res.status(404).json({ error: 'Arena not found' });
    const { name, slug } = arena.rows[0];
    const inUse = await pool.query('SELECT COUNT(*) FROM tournaments WHERE arena=$1', [slug]);
    if (parseInt(inUse.rows[0].count) > 0) {
      return res.status(400).json({ error: `Cannot delete: ${inUse.rows[0].count} tournament(s) use this arena. Deactivate it instead.` });
    }
    await pool.query('DELETE FROM arenas WHERE id=$1', [req.params.id]);
    logAction(req.user.id, 'DELETE_ARENA', { name, slug }, req.ip).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
