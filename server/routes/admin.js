const express = require('express');
const router = express.Router();
const pool = require('../db');
const { adminMiddleware } = require('../auth');
const bcrypt = require('bcryptjs');

// Dashboard stats
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const [users, tournaments, registrations, matches] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE role != $1', ['admin']),
      pool.query('SELECT COUNT(*) FROM tournaments'),
      pool.query('SELECT COUNT(*) FROM registrations WHERE payment_status=$1', ['paid']),
      pool.query('SELECT COUNT(*) FROM match_results')
    ]);
    const pendingMatches = await pool.query(
      "SELECT COUNT(*) FROM match_results WHERE status='pending_review'"
    );
    res.json({
      total_users: parseInt(users.rows[0].count),
      total_tournaments: parseInt(tournaments.rows[0].count),
      total_registrations: parseInt(registrations.rows[0].count),
      total_matches: parseInt(matches.rows[0].count),
      pending_reviews: parseInt(pendingMatches.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All users
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, phone, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ban/unban user
router.patch('/users/:id/role', adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ['player', 'admin', 'banned'];
    if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const result = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, username, email, role',
      [role, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All registrations
router.get('/registrations', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.username, u.email, t.name as tournament_name, t.arena
       FROM registrations r JOIN users u ON u.id=r.user_id JOIN tournaments t ON t.id=r.tournament_id
       ORDER BY r.registered_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin login (separate from user login — uses ADMIN_PASSWORD env)
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    // Find or create admin user
    let admin = await pool.query("SELECT * FROM users WHERE role='admin' LIMIT 1");
    if (!admin.rows.length) {
      const hash = await bcrypt.hash(password, 10);
      admin = await pool.query(
        "INSERT INTO users (username, email, password_hash, role) VALUES ('admin','admin@unclescar.com',$1,'admin') RETURNING *",
        [hash]
      );
    } else {
      admin = { rows: admin.rows };
    }
    const { signToken } = require('../auth');
    const token = signToken(admin.rows[0]);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
