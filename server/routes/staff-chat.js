const express = require('express');
const router = express.Router();
const pool = require('../db');
const { adminMiddleware } = require('../auth');

// ── Group chat: get messages ──────────────────────────────────────────────────
router.get('/group', adminMiddleware, async (req, res) => {
  try {
    const since = req.query.since;
    let query, params;
    if (since) {
      query = `
        SELECT sm.id, sm.sender_id, sm.content, sm.created_at, u.username AS sender_username, u.title AS sender_title
        FROM staff_messages sm
        JOIN users u ON u.id = sm.sender_id
        WHERE sm.type='group' AND sm.created_at > $1
        ORDER BY sm.created_at ASC LIMIT 200
      `;
      params = [since];
    } else {
      query = `
        SELECT sm.id, sm.sender_id, sm.content, sm.created_at, u.username AS sender_username, u.title AS sender_title
        FROM staff_messages sm
        JOIN users u ON u.id = sm.sender_id
        WHERE sm.type='group'
        ORDER BY sm.created_at DESC LIMIT 100
      `;
      params = [];
    }
    const result = await pool.query(query, params);
    res.json(since ? result.rows : result.rows.reverse());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Group chat: send message ──────────────────────────────────────────────────
router.post('/group', adminMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
    const result = await pool.query(
      `INSERT INTO staff_messages (sender_id, content, type)
       VALUES ($1, $2, 'group') RETURNING id, sender_id, content, created_at`,
      [req.user.id, content.trim().substring(0, 2000)]
    );
    const sender = await pool.query('SELECT username, title FROM users WHERE id=$1', [req.user.id]);
    res.json({
      ...result.rows[0],
      sender_username: sender.rows[0]?.username,
      sender_title: sender.rows[0]?.title || 'Admin'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DMs: get all DM conversations (Super Admin view) ─────────────────────────
router.get('/dm/inbox', adminMiddleware, async (req, res) => {
  try {
    // Get list of staff members that have DM history
    const result = await pool.query(`
      SELECT DISTINCT ON (other_user)
        CASE WHEN sm.sender_id=$1 THEN sm.recipient_id ELSE sm.sender_id END AS other_user,
        u.username, u.title AS role,
        sm.content AS last_message, sm.created_at AS last_at,
        COUNT(CASE WHEN sm.recipient_id=$1 AND sm.dm_read=false THEN 1 END) OVER (
          PARTITION BY CASE WHEN sm.sender_id=$1 THEN sm.recipient_id ELSE sm.sender_id END
        ) AS unread_count
      FROM staff_messages sm
      JOIN users u ON u.id = CASE WHEN sm.sender_id=$1 THEN sm.recipient_id ELSE sm.sender_id END
      WHERE sm.type='dm' AND (sm.sender_id=$1 OR sm.recipient_id=$1)
      ORDER BY other_user, sm.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DMs: get messages with a specific user ────────────────────────────────────
router.get('/dm/:userId', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    // Only allow: Super Admin can DM anyone, staff can only DM Super Admin
    const superAdmins = await pool.query(
      "SELECT id FROM users WHERE role='admin' AND (title='Super Admin' OR title IS NULL) LIMIT 1"
    );
    const superAdminId = superAdmins.rows[0]?.id;
    const isSuperAdmin = req.user.id === superAdminId;

    if (!isSuperAdmin && userId !== superAdminId) {
      return res.status(403).json({ error: 'You can only DM the Super Admin' });
    }

    // Mark messages as read
    await pool.query(
      "UPDATE staff_messages SET dm_read=true WHERE type='dm' AND sender_id=$1 AND recipient_id=$2",
      [userId, req.user.id]
    );

    const result = await pool.query(`
      SELECT sm.id, sm.content, sm.created_at, sm.sender_id, sm.dm_read,
             u.username AS sender_username, u.title AS sender_title
      FROM staff_messages sm
      JOIN users u ON u.id = sm.sender_id
      WHERE sm.type='dm'
        AND ((sm.sender_id=$1 AND sm.recipient_id=$2) OR (sm.sender_id=$2 AND sm.recipient_id=$1))
      ORDER BY sm.created_at ASC LIMIT 200
    `, [req.user.id, userId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DMs: send a DM ────────────────────────────────────────────────────────────
router.post('/dm/:userId', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

    // Only allow: Super Admin can DM anyone, staff can only DM Super Admin
    const superAdmins = await pool.query(
      "SELECT id FROM users WHERE role='admin' AND (title='Super Admin' OR title IS NULL) LIMIT 1"
    );
    const superAdminId = superAdmins.rows[0]?.id;
    const isSuperAdmin = req.user.id === superAdminId;

    if (!isSuperAdmin && userId !== superAdminId) {
      return res.status(403).json({ error: 'You can only DM the Super Admin' });
    }

    const result = await pool.query(
      `INSERT INTO staff_messages (sender_id, recipient_id, content, type)
       VALUES ($1, $2, $3, 'dm') RETURNING id, content, created_at, sender_id`,
      [req.user.id, userId, content.trim().substring(0, 2000)]
    );
    const sender = await pool.query('SELECT username, title FROM users WHERE id=$1', [req.user.id]);
    res.json({
      ...result.rows[0],
      sender_username: sender.rows[0]?.username,
      sender_title: sender.rows[0]?.title || 'Admin'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Unread DM count ───────────────────────────────────────────────────────────
router.get('/unread', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) FROM staff_messages WHERE type='dm' AND recipient_id=$1 AND dm_read=false",
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Staff list (for DM panel) ─────────────────────────────────────────────────
router.get('/staff-list', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, title, last_active FROM users WHERE role='admin' AND id != $1 ORDER BY created_at ASC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
