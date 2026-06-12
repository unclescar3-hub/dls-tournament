const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { adminMiddleware } = require('../auth');
const bcrypt = require('bcryptjs');
const { sendAdminInviteEmail } = require('../email');
const { createNotification } = require('../notifHelper');

// Dashboard stats
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const [users, tournaments, registrations, matches, pendingMatches, disputes] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role != 'admin'"),
      pool.query('SELECT COUNT(*) FROM tournaments'),
      pool.query("SELECT COUNT(*) FROM registrations WHERE payment_status='paid'"),
      pool.query('SELECT COUNT(*) FROM match_results'),
      pool.query("SELECT COUNT(*) FROM match_results WHERE status='pending_review'"),
      pool.query("SELECT COUNT(*) FROM disputes WHERE status='open'")
    ]);
    res.json({
      total_users: parseInt(users.rows[0].count),
      total_tournaments: parseInt(tournaments.rows[0].count),
      total_registrations: parseInt(registrations.rows[0].count),
      total_matches: parseInt(matches.rows[0].count),
      pending_reviews: parseInt(pendingMatches.rows[0].count),
      open_disputes: parseInt(disputes.rows[0].count)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin login — username + password
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Look up admin user in DB by username
    const result = await pool.query(
      "SELECT * FROM users WHERE LOWER(username)=LOWER($1) AND role='admin'",
      [username.trim()]
    );

    if (result.rows.length) {
      // Verify bcrypt password
      const valid = await bcrypt.compare(password, result.rows[0].password_hash);
      // Also allow ADMIN_PASSWORD env var as a master override (in case bcrypt is stale)
      const masterOverride = password === process.env.ADMIN_PASSWORD;
      if (!valid && !masterOverride) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      const { signToken } = require('../auth');
      const token = signToken(result.rows[0]);
      res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
      return res.json({ success: true });
    }

    // Bootstrap: no admin in DB yet — check against ADMIN_PASSWORD env var
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    if (username.trim().toLowerCase() === adminUsername.toLowerCase() && password === process.env.ADMIN_PASSWORD) {
      const hash = await bcrypt.hash(password, 10);
      const created = await pool.query(
        `INSERT INTO users (username, email, password_hash, role, title)
         VALUES ($1,'admin@unclescar.com',$2,'admin','Super Admin')
         ON CONFLICT (username) DO UPDATE SET role='admin', title='Super Admin'
         RETURNING *`,
        [adminUsername, hash]
      );
      const { signToken } = require('../auth');
      const token = signToken(created.rows[0]);
      res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
      return res.json({ success: true });
    }

    return res.status(401).json({ error: 'Invalid username or password' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Invite a co-admin (with title)
router.post('/invite', adminMiddleware, async (req, res) => {
  try {
    const { email, title } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const token = crypto.randomBytes(48).toString('hex');
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    await pool.query(
      'INSERT INTO admin_invites (email, token, invited_by, expires_at, title) VALUES ($1,$2,$3,$4,$5)',
      [email.trim().toLowerCase(), token, req.user.id, expires, title || 'Admin Staff']
    );
    const inviterResult = await pool.query('SELECT username, title FROM users WHERE id=$1', [req.user.id]);
    const inviterName = inviterResult.rows[0]?.username || 'Admin';
    await sendAdminInviteEmail(email, inviterName, token, title || 'Admin Staff');
    res.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    console.error('Invite error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all admins (with titles)
router.get('/admins', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, title, created_at FROM users WHERE role='admin' ORDER BY created_at ASC"
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate match code
router.post('/match-code', adminMiddleware, async (req, res) => {
  try {
    const { tournament_id, player1_id, player2_id, note } = req.body;
    if (!tournament_id || !player1_id || !player2_id) {
      return res.status(400).json({ error: 'tournament_id, player1_id and player2_id are required' });
    }
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
    const player1 = p1.rows[0], player2 = p2.rows[0];
    const tournamentName = t.rows[0]?.name || 'Tournament';

    const { sendMatchCodeEmail } = require('../email');
    await Promise.all([
      sendMatchCodeEmail(player1, player2, code, tournamentName, note),
      sendMatchCodeEmail(player2, player1, code, tournamentName, note)
    ]);

    // In-app notifications
    await Promise.all([
      createNotification(player1_id, 'code', `🎮 Match Code: ${tournamentName}`, `Your lobby code vs ${player2.username} is: ${code}`, '/dashboard.html'),
      createNotification(player2_id, 'code', `🎮 Match Code: ${tournamentName}`, `Your lobby code vs ${player1.username} is: ${code}`, '/dashboard.html')
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Global leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username,
        SUM(be.points) as total_points, SUM(be.wins) as total_wins, SUM(be.draws) as total_draws,
        SUM(be.losses) as total_losses, SUM(be.goals_for) as total_gf, SUM(be.goals_against) as total_ga,
        SUM(be.goal_diff) as total_gd, COUNT(DISTINCT be.tournament_id) as tournaments_played
       FROM bracket_entries be JOIN users u ON u.id = be.user_id
       GROUP BY u.id, u.username
       ORDER BY total_points DESC, total_gd DESC, total_gf DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Per-arena leaderboard
router.get('/leaderboard/:arena', async (req, res) => {
  try {
    const { arena } = req.params;
    const result = await pool.query(
      `SELECT u.id, u.username,
        SUM(be.points) as total_points, SUM(be.wins) as total_wins, SUM(be.draws) as total_draws,
        SUM(be.losses) as total_losses, SUM(be.goals_for) as total_gf, SUM(be.goals_against) as total_ga,
        SUM(be.goal_diff) as total_gd, COUNT(DISTINCT be.tournament_id) as tournaments_played
       FROM bracket_entries be JOIN users u ON u.id = be.user_id
       JOIN tournaments t ON t.id = be.tournament_id WHERE t.arena=$1
       GROUP BY u.id, u.username
       ORDER BY total_points DESC, total_gd DESC, total_gf DESC LIMIT 100`,
      [arena]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DISPUTES ─────────────────────────────────────────────────────────────────

router.get('/disputes', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.username as raised_by_name, u.email as raised_by_email,
              mr.submitter_score, mr.opponent_score, mr.screenshot_path,
              us.username as submitter_name, uo.username as opponent_name,
              t.name as tournament_name, t.arena
       FROM disputes d
       JOIN users u ON u.id = d.raised_by
       JOIN match_results mr ON mr.id = d.match_result_id
       JOIN users us ON us.id = mr.submitter_id
       JOIN users uo ON uo.id = mr.opponent_id
       JOIN tournaments t ON t.id = d.tournament_id
       ORDER BY d.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/disputes/:id/resolve', adminMiddleware, async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!['resolved', 'dismissed'].includes(status)) return res.status(400).json({ error: 'status must be resolved or dismissed' });
    const result = await pool.query(
      `UPDATE disputes SET status=$1, admin_note=$2, resolved_by=$3, resolved_at=NOW() WHERE id=$4 RETURNING *`,
      [status, admin_note || null, req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Dispute not found' });
    const d = result.rows[0];

    // Notify the player who raised it
    await createNotification(d.raised_by, 'dispute',
      status === 'resolved' ? '✅ Dispute Resolved' : '❌ Dispute Dismissed',
      admin_note || (status === 'resolved' ? 'Your dispute has been resolved.' : 'Your dispute was dismissed.'),
      '/dashboard.html'
    );

    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public player profile
router.get('/profile/:username', async (req, res) => {
  try {
    const user = await pool.query(
      "SELECT id, username, created_at FROM users WHERE LOWER(username)=LOWER($1) AND role != 'banned'",
      [req.params.username]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'Player not found' });
    const u = user.rows[0];

    const [stats, history] = await Promise.all([
      pool.query(
        `SELECT SUM(be.points) as total_points, SUM(be.wins) as total_wins, SUM(be.draws) as total_draws,
                SUM(be.losses) as total_losses, SUM(be.goals_for) as total_gf, SUM(be.goals_against) as total_ga,
                COUNT(DISTINCT be.tournament_id) as tournaments_played
         FROM bracket_entries be WHERE be.user_id=$1`, [u.id]
      ),
      pool.query(
        `SELECT t.name, t.arena, t.status, be.points, be.wins, be.draws, be.losses,
                be.goals_for, be.goals_against,
                (SELECT COUNT(*) FROM bracket_entries WHERE tournament_id=t.id) as total_players,
                RANK() OVER (PARTITION BY be.tournament_id ORDER BY be.points DESC, be.goal_diff DESC) as rank
         FROM bracket_entries be
         JOIN tournaments t ON t.id = be.tournament_id
         WHERE be.user_id=$1
         ORDER BY t.created_at DESC LIMIT 20`, [u.id]
      )
    ]);

    res.json({ user: u, stats: stats.rows[0], history: history.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send platform-wide announcement notification to all players
router.post('/broadcast', adminMiddleware, async (req, res) => {
  try {
    const { title, body, link } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const players = await pool.query("SELECT id FROM users WHERE role='player'");
    for (const p of players.rows) {
      await createNotification(p.id, 'announcement', title, body, link || null);
    }
    res.json({ success: true, sent_to: players.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
