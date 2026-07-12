const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { createNotification } = require('../notifHelper');
const { logAction } = require('../adminLogger');

// ── Get PG settings (public) ──────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const s = await pool.query('SELECT * FROM proving_ground_settings LIMIT 1');
    res.json(s.rows[0] || { is_paid: false, entry_fee: 0, is_active: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: update PG settings ─────────────────────────────────────────────────
router.post('/settings', adminMiddleware, async (req, res) => {
  try {
    const { is_paid, entry_fee, is_active } = req.body;
    await pool.query(
      `INSERT INTO proving_ground_settings (id, is_paid, entry_fee, is_active)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET is_paid=$1, entry_fee=$2, is_active=$3, updated_at=NOW()`,
      [!!is_paid, parseInt(entry_fee) || 0, is_active !== false]
    );
    logAction(req.user.id, 'UPDATE_PG_SETTINGS', { is_paid, entry_fee, is_active }, req.ip).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get current PG session / queue ───────────────────────────────────────────
router.get('/queue', authMiddleware, async (req, res) => {
  try {
    const queue = await pool.query(`
      SELECT pgs.id, pgs.user_id, pgs.status, pgs.game_code, pgs.matched_with,
             u.username,
             mu.username AS opponent_username
      FROM proving_ground_sessions pgs
      JOIN users u ON u.id = pgs.user_id
      LEFT JOIN users mu ON mu.id = pgs.matched_with
      WHERE pgs.status IN ('waiting','matched')
      ORDER BY pgs.joined_at ASC
    `);
    const myEntry = queue.rows.find(r => r.user_id === req.user.id);
    res.json({
      queue: queue.rows,
      my_entry: myEntry || null,
      waiting_count: queue.rows.filter(r => r.status === 'waiting').length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Join Proving Ground ───────────────────────────────────────────────────────
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const settings = await pool.query('SELECT * FROM proving_ground_settings LIMIT 1');
    const s = settings.rows[0] || { is_active: true };
    if (!s.is_active) return res.status(400).json({ error: 'Proving Ground is currently closed' });

    // Check if already in queue or matched
    const existing = await pool.query(
      "SELECT * FROM proving_ground_sessions WHERE user_id=$1 AND status IN ('waiting','matched')",
      [req.user.id]
    );
    if (existing.rows.length) return res.status(400).json({ error: 'You are already in the queue' });

    // Join queue
    const entry = await pool.query(
      `INSERT INTO proving_ground_sessions (user_id, status) VALUES ($1, 'waiting') RETURNING *`,
      [req.user.id]
    );

    // Check for a waiting opponent
    const waiting = await pool.query(
      "SELECT pgs.*, u.username, u.email FROM proving_ground_sessions pgs JOIN users u ON u.id=pgs.user_id WHERE pgs.status='waiting' AND pgs.user_id != $1 ORDER BY pgs.joined_at ASC LIMIT 1",
      [req.user.id]
    );

    if (waiting.rows.length) {
      const opponent = waiting.rows[0];
      const me = await pool.query('SELECT id, username, email FROM users WHERE id=$1', [req.user.id]);
      const myData = me.rows[0];
      const gameCode = crypto.randomBytes(4).toString('hex').toUpperCase();

      // Match them
      await pool.query(
        `UPDATE proving_ground_sessions SET status='matched', matched_with=$1, game_code=$2 WHERE id=$3`,
        [req.user.id, gameCode, opponent.id]
      );
      await pool.query(
        `UPDATE proving_ground_sessions SET status='matched', matched_with=$1, game_code=$2 WHERE id=$3`,
        [opponent.user_id, gameCode, entry.rows[0].id]
      );

      // Send in-app notifications
      await Promise.all([
        createNotification(myData.id, 'code',
          `🎮 Proving Ground Match Found!`,
          `You're matched vs ${opponent.username}. Game Code: ${gameCode}`,
          '/dashboard.html'
        ),
        createNotification(opponent.user_id, 'code',
          `🎮 Proving Ground Match Found!`,
          `You're matched vs ${myData.username}. Game Code: ${gameCode}`,
          '/dashboard.html'
        )
      ]);

      // Send emails
      const { sendProvingGroundMatchEmail } = require('../email');
      Promise.all([
        sendProvingGroundMatchEmail(myData, opponent, gameCode),
        sendProvingGroundMatchEmail(opponent, myData, gameCode)
      ]).catch(e => console.warn('PG email failed:', e.message));

      return res.json({
        success: true,
        matched: true,
        game_code: gameCode,
        opponent: opponent.username,
        message: 'Match found! Check your email and notifications for your game code.'
      });
    }

    res.json({ success: true, matched: false, message: 'You have joined the queue. Waiting for an opponent...' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Leave queue ───────────────────────────────────────────────────────────────
router.delete('/leave', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM proving_ground_sessions WHERE user_id=$1 AND status='waiting'",
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: get all PG sessions ────────────────────────────────────────────────
router.get('/sessions', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pgs.*, u.username, u.email, mu.username AS matched_username
      FROM proving_ground_sessions pgs
      JOIN users u ON u.id = pgs.user_id
      LEFT JOIN users mu ON mu.id = pgs.matched_with
      ORDER BY pgs.joined_at DESC LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: clear finished sessions ───────────────────────────────────────────
router.delete('/sessions/clear', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM proving_ground_sessions WHERE status IN ('matched','completed')"
    );
    res.json({ success: true, cleared: result.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
