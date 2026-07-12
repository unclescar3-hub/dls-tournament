const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { adminMiddleware } = require('../auth');
const { logAction } = require('../adminLogger');

const uploadDir = 'public/uploads/promotions';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'promo-' + Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ── Public: get active public promotions ──────────────────────────────────────
router.get('/public', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, image_path, visibility, created_at
       FROM promotions
       WHERE active=true AND visibility IN ('public','both')
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: get all promotions ─────────────────────────────────────────────────
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username AS created_by_name
       FROM promotions p
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: get active internal promotions ─────────────────────────────────────
router.get('/internal', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, image_path, visibility, created_at
       FROM promotions
       WHERE active=true AND visibility IN ('internal','both')
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: create promotion ───────────────────────────────────────────────────
router.post('/', adminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, description, visibility, active } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const validVis = ['internal', 'public', 'both'];
    if (!validVis.includes(visibility)) return res.status(400).json({ error: 'visibility must be internal, public, or both' });
    const imagePath = req.file ? '/uploads/promotions/' + req.file.filename : null;
    const result = await pool.query(
      `INSERT INTO promotions (title, description, image_path, visibility, active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description || null, imagePath, visibility, active !== 'false', req.user.id]
    );
    logAction(req.user.id, 'CREATE_PROMOTION', { title, visibility }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: update promotion ───────────────────────────────────────────────────
router.patch('/:id', adminMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, description, visibility, active } = req.body;
    const existing = await pool.query('SELECT * FROM promotions WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Promotion not found' });
    const p = existing.rows[0];
    const imagePath = req.file ? '/uploads/promotions/' + req.file.filename : p.image_path;
    const result = await pool.query(
      `UPDATE promotions SET title=$1, description=$2, image_path=$3, visibility=$4, active=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [
        title || p.title,
        description !== undefined ? description : p.description,
        imagePath,
        visibility || p.visibility,
        active !== undefined ? active !== 'false' : p.active,
        req.params.id
      ]
    );
    logAction(req.user.id, 'UPDATE_PROMOTION', { id: req.params.id, title: title || p.title }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: toggle active ──────────────────────────────────────────────────────
router.patch('/:id/toggle', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE promotions SET active = NOT active, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    logAction(req.user.id, 'TOGGLE_PROMOTION', { id: req.params.id, active: result.rows[0].active }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: delete promotion ───────────────────────────────────────────────────
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const existing = await pool.query('SELECT image_path FROM promotions WHERE id=$1', [req.params.id]);
    if (existing.rows.length && existing.rows[0].image_path) {
      const fullPath = 'public' + existing.rows[0].image_path;
      fs.unlink(fullPath, () => {});
    }
    await pool.query('DELETE FROM promotions WHERE id=$1', [req.params.id]);
    logAction(req.user.id, 'DELETE_PROMOTION', { id: req.params.id }, req.ip).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
