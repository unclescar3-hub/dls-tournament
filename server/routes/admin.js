const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { adminMiddleware } = require('../auth');
const bcrypt = require('bcryptjs');
const { sendAdminInviteEmail } = require('../email');

// Dashboard stats
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const [users, tournaments, registrations, matches, pendingMatches] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role != 'admin'"),
      pool.query('SELECT COUNT(*) FROM tournaments'),
      pool.query("SELECT COUNT(*) FROM registrations WHERE payment_status='paid'"),
      pool.query('SELECT COUNT(*) FROM match_results'),
      pool.query("SELECT COUNT(*) FROM match_results WHERE status='pending_review'")
    ]);
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

// All users (with bank account info)
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.phone, u.role, u.created_at,
              ba.account_name as bank_account_name, ba.bank_name, ba.verified as bank_verified
       FROM users u
       LEFT JOIN bank_accounts ba ON ba.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change user role
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

// Admin login via ADMIN_PASSWORD env var
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    let admin = await pool.query("SELECT * FROM users WHERE role='admin' LIMIT 1");
    if (!admin.rows.length) {
      const hash = await bcrypt.hash(password, 10);
      const created = await pool.query(
        "INSERT INTO users (username, email, password_hash, role) VALUES ('admin','admin@unclescar.com',$1,'admin') RETURNING *",
        [hash]
      );
      admin = { rows: created.rows };
    }
    const { signToken } = require('../auth');
    const token = signToken(admin.rows[0]);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invite a co-admin
router.post('/invite', adminMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const token = crypto.randomBytes(48).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await pool.query(
      'INSERT INTO admin_invites (email, token, invited_by, expires_at) VALUES ($1,$2,$3,$4)',
      [email.trim().toLowerCase(), token, req.user.id, expires]
    );

    const inviterResult = await pool.query('SELECT username FROM users WHERE id=$1', [req.user.id]);
    const inviterName = inviterResult.rows[0]?.username || 'Admin';

    await sendAdminInviteEmail(email, inviterName, token);
    res.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    console.error('Invite error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all admins
router.get('/admins', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, created_at FROM users WHERE role='admin' ORDER BY created_at ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate match code for two players and email both
router.post('/match-code', adminMiddleware, async (req, res) => {
  try {
    const { tournament_id, player1_id, player2_id, note } = req.body;
    if (!tournament_id || !player1_id || !player2_id) {
      return res.status(400).json({ error: 'tournament_id, player1_id and player2_id are required' });
    }

    // Generate a clean 8-char alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();

    await pool.query(
      'INSERT INTO match_codes (tournament_id, player1_id, player2_id, code, note) VALUES ($1,$2,$3,$4,$5)',
      [tournament_id, player1_id, player2_id, code, note || null]
    );

    const [p1, p2, t] = await Promise.all([
      pool.query('SELECT id, username, email FROM users WHERE id=$1', [player1_id]),
      pool.query('SELECT id, username, email FROM users WHERE id=$1', [player2_id]),
      pool.query('SELECT name FROM tournaments WHERE id=$1', [tournament_id])
    ]);

    if (!p1.rows.length || !p2.rows.length) return res.status(404).json({ error: 'Player not found' });

    const player1 = p1.rows[0];
    const player2 = p2.rows[0];
    const tournamentName = t.rows[0]?.name || 'Tournament';

    const { sendMatchCodeEmail } = require('../email');
    await Promise.all([
      sendMatchCodeEmail(player1, player2, code, tournamentName, note),
      sendMatchCodeEmail(player2, player1, code, tournamentName, note)
    ]);

    res.json({ success: true, code, player1: player1.username, player2: player2.username });
  } catch (err) {
    console.error('Match code error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List match codes
router.get('/match-codes', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mc.*, u1.username as player1_name, u2.username as player2_name, t.name as tournament_name
       FROM match_codes mc
       JOIN users u1 ON u1.id = mc.player1_id
       JOIN users u2 ON u2.id = mc.player2_id
       JOIN tournaments t ON t.id = mc.tournament_id
       ORDER BY mc.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global leaderboard across ALL arenas
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username,
        SUM(be.points) as total_points,
        SUM(be.wins) as total_wins,
        SUM(be.draws) as total_draws,
        SUM(be.losses) as total_losses,
        SUM(be.goals_for) as total_gf,
        SUM(be.goals_against) as total_ga,
        SUM(be.goal_diff) as total_gd,
        COUNT(DISTINCT be.tournament_id) as tournaments_played
       FROM bracket_entries be
       JOIN users u ON u.id = be.user_id
       GROUP BY u.id, u.username
       ORDER BY total_points DESC, total_gd DESC, total_gf DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-arena leaderboard
router.get('/leaderboard/:arena', async (req, res) => {
  try {
    const { arena } = req.params;
    const result = await pool.query(
      `SELECT u.id, u.username,
        SUM(be.points) as total_points,
        SUM(be.wins) as total_wins,
        SUM(be.draws) as total_draws,
        SUM(be.losses) as total_losses,
        SUM(be.goals_for) as total_gf,
        SUM(be.goals_against) as total_ga,
        SUM(be.goal_diff) as total_gd,
        COUNT(DISTINCT be.tournament_id) as tournaments_played
       FROM bracket_entries be
       JOIN users u ON u.id = be.user_id
       JOIN tournaments t ON t.id = be.tournament_id
       WHERE t.arena = $1
       GROUP BY u.id, u.username
       ORDER BY total_points DESC, total_gd DESC, total_gf DESC
       LIMIT 100`,
      [arena]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
