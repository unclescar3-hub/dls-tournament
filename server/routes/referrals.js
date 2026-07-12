const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { logAction } = require('../adminLogger');

// ── Player: get my referral info ──────────────────────────────────────────────
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, username, referral_code, referral_points, referral_cash FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    const u = user.rows[0];

    const [freeRefs, paidRefs] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE referred_by=$1', [req.user.id]),
      pool.query(
        `SELECT COUNT(DISTINCT u.id) FROM users u
         JOIN registrations r ON r.user_id = u.id
         WHERE u.referred_by=$1 AND r.payment_status='paid'`,
        [req.user.id]
      )
    ]);

    res.json({
      referral_code: u.referral_code || u.username.toLowerCase(),
      referral_points: u.referral_points || 0,
      referral_cash: u.referral_cash || 0,
      total_referred: parseInt(freeRefs.rows[0].count),
      paid_referred: parseInt(paidRefs.rows[0].count)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Public: lookup referral code (used at registration) ───────────────────────
router.get('/lookup/:code', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username FROM users WHERE LOWER(referral_code)=LOWER($1) OR LOWER(username)=LOWER($1)",
      [req.params.code]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Referral code not found' });
    res.json({ valid: true, username: result.rows[0].username });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: get referral settings ──────────────────────────────────────────────
router.get('/settings', adminMiddleware, async (req, res) => {
  try {
    const settings = await pool.query('SELECT * FROM referral_settings LIMIT 1');
    res.json(settings.rows[0] || { points_per_free_ref: 10 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: get all tiers ───────────────────────────────────────────────────────
router.get('/tiers', adminMiddleware, async (req, res) => {
  try {
    const tiers = await pool.query('SELECT * FROM referral_tiers ORDER BY min_referrals ASC');
    res.json(tiers.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: update points per free referral ───────────────────────────────────
router.post('/settings', adminMiddleware, async (req, res) => {
  try {
    const { points_per_free_ref } = req.body;
    await pool.query(
      `INSERT INTO referral_settings (id, points_per_free_ref) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET points_per_free_ref=$1, updated_at=NOW()`,
      [parseInt(points_per_free_ref) || 10]
    );
    logAction(req.user.id, 'UPDATE_REFERRAL_SETTINGS', { points_per_free_ref }, req.ip).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: add/update referral tier ──────────────────────────────────────────
router.post('/tiers', adminMiddleware, async (req, res) => {
  try {
    const { min_referrals, cash_reward } = req.body;
    if (!min_referrals || !cash_reward) return res.status(400).json({ error: 'min_referrals and cash_reward required' });
    const result = await pool.query(
      `INSERT INTO referral_tiers (min_referrals, cash_reward)
       VALUES ($1, $2)
       ON CONFLICT (min_referrals) DO UPDATE SET cash_reward=$2
       RETURNING *`,
      [parseInt(min_referrals), parseInt(cash_reward)]
    );
    logAction(req.user.id, 'UPSERT_REFERRAL_TIER', { min_referrals, cash_reward }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: delete referral tier ───────────────────────────────────────────────
router.delete('/tiers/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM referral_tiers WHERE id=$1', [req.params.id]);
    logAction(req.user.id, 'DELETE_REFERRAL_TIER', { tier_id: req.params.id }, req.ip).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: referral dashboard (all players) ───────────────────────────────────
router.get('/dashboard', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.referral_code, u.referral_points, u.referral_cash,
             COUNT(ref.id) AS total_referred,
             COUNT(CASE WHEN r.payment_status='paid' THEN ref.id END) AS paid_referred
      FROM users u
      LEFT JOIN users ref ON ref.referred_by = u.id
      LEFT JOIN registrations r ON r.user_id = ref.id
      WHERE u.role = 'player'
      GROUP BY u.id
      HAVING COUNT(ref.id) > 0
      ORDER BY total_referred DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
