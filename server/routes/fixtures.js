const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { createNotification } = require('../notifHelper');
const { sendEmail } = require('../email');

const APP_URL = () => process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;

// All upcoming fixtures (public)
router.get('/', async (req, res) => {
  try {
    const { tournament_id, arena } = req.query;
    let query = `
      SELECT f.*, 
        u1.username as player1_name, u1.email as player1_email,
        u2.username as player2_name, u2.email as player2_email,
        t.name as tournament_name, t.arena
      FROM fixtures f
      JOIN users u1 ON u1.id = f.player1_id
      JOIN users u2 ON u2.id = f.player2_id
      JOIN tournaments t ON t.id = f.tournament_id
      WHERE f.status != 'cancelled'`;
    const params = [];
    if (tournament_id) { params.push(tournament_id); query += ` AND f.tournament_id=$${params.length}`; }
    if (arena) { params.push(arena); query += ` AND t.arena=$${params.length}`; }
    query += ` ORDER BY f.scheduled_at ASC LIMIT 100`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// My upcoming fixtures
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*,
        u1.username as player1_name, u2.username as player2_name,
        t.name as tournament_name, t.arena
       FROM fixtures f
       JOIN users u1 ON u1.id = f.player1_id
       JOIN users u2 ON u2.id = f.player2_id
       JOIN tournaments t ON t.id = f.tournament_id
       WHERE (f.player1_id=$1 OR f.player2_id=$1) AND f.status != 'cancelled'
       ORDER BY f.scheduled_at ASC LIMIT 20`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create fixture (admin)
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { tournament_id, player1_id, player2_id, scheduled_at, round_label, match_code, note } = req.body;
    if (!tournament_id || !player1_id || !player2_id || !scheduled_at) {
      return res.status(400).json({ error: 'tournament_id, player1_id, player2_id, scheduled_at required' });
    }
    if (player1_id === player2_id) return res.status(400).json({ error: 'Players must be different' });

    const result = await pool.query(
      `INSERT INTO fixtures (tournament_id, player1_id, player2_id, scheduled_at, round_label, match_code, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tournament_id, player1_id, player2_id, scheduled_at, round_label || null, match_code || null, note || null, req.user.id]
    );
    const fixture = result.rows[0];

    // Get player and tournament details
    const [p1, p2, t] = await Promise.all([
      pool.query('SELECT username, email FROM users WHERE id=$1', [player1_id]),
      pool.query('SELECT username, email FROM users WHERE id=$1', [player2_id]),
      pool.query('SELECT name, arena FROM tournaments WHERE id=$1', [tournament_id])
    ]);

    const player1 = p1.rows[0], player2 = p2.rows[0];
    const tourney = t.rows[0];
    const matchDate = new Date(scheduled_at).toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos' });

    // In-app notifications for both players
    const notifBody = `vs ${player2.username} on ${matchDate}${round_label ? ' (' + round_label + ')' : ''}`;
    await Promise.all([
      createNotification(player1_id, 'fixture', `📅 Match Scheduled: ${tourney.name}`, `You play vs ${player2.username} on ${matchDate}`, '/dashboard.html'),
      createNotification(player2_id, 'fixture', `📅 Match Scheduled: ${tourney.name}`, `You play vs ${player1.username} on ${matchDate}`, '/dashboard.html')
    ]);

    // Email both players
    const baseWrapper = content => `<div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;border-radius:12px">
      <div style="text-align:center;margin-bottom:28px"><h1 style="color:#00e676;font-size:26px;letter-spacing:3px;margin:0">UNCLESCAR <span style="color:#f0f4ff">STUDIOS</span></h1></div>
      ${content}
      <hr style="border:1px solid #1e2d45;margin:32px 0">
      <p style="color:#6b7a99;font-size:11px;text-align:center">&copy; 2026 Unclescar Studios</p></div>`;

    const fixtureEmail = (player, opponent) => baseWrapper(`
      <h2>Match Fixture Confirmed</h2>
      <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${player.username}</strong>, your match has been scheduled in <strong style="color:#00e676">${tourney.name}</strong>.</p>
      <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
        ${round_label ? `<div style="color:#ffc107;font-size:.78rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">${round_label}</div>` : ''}
        <div style="font-size:1.5rem;font-weight:700;margin-bottom:16px">${player.username} <span style="color:#6b7a99;font-size:1.1rem">vs</span> ${opponent.username}</div>
        <div style="color:#6b7a99;font-size:.82rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Scheduled For</div>
        <div style="font-size:1.15rem;font-weight:700;color:#00e676">${matchDate}</div>
        ${match_code ? `<div style="margin-top:16px;background:#00e67620;border:2px solid #00e676;border-radius:8px;padding:14px;display:inline-block;min-width:200px">
          <div style="font-size:.72rem;color:#6b7a99;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Lobby Code</div>
          <div style="font-family:monospace;font-size:2rem;font-weight:700;letter-spacing:5px;color:#00e676">${match_code}</div>
        </div>` : ''}
      </div>
      ${note ? `<div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:12px;margin-bottom:14px"><div style="color:#ffc107;font-size:.78rem;font-weight:700;margin-bottom:4px">ADMIN NOTE</div><p style="color:#6b7a99;margin:0;font-size:.85rem">${note}</p></div>` : ''}
      <div style="text-align:center;margin-top:20px">
        <a href="${APP_URL()}/fixtures.html" style="background:#00e676;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1px">View All Fixtures</a>
      </div>`);

    if (process.env.GMAIL_APP_PASSWORD) {
      await Promise.all([
        sendEmail({ to: player1.email, subject: `Match Scheduled: vs ${player2.username} — ${tourney.name}`, html: fixtureEmail(player1, player2) }),
        sendEmail({ to: player2.email, subject: `Match Scheduled: vs ${player1.username} — ${tourney.name}`, html: fixtureEmail(player2, player1) })
      ]).catch(e => console.warn('Fixture email failed:', e.message));
    }

    res.json({ success: true, fixture: { ...fixture, player1_name: player1.username, player2_name: player2.username, tournament_name: tourney.name } });
  } catch (err) {
    console.error('Create fixture error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update fixture status or details (admin)
router.patch('/:id', adminMiddleware, async (req, res) => {
  try {
    const { status, scheduled_at, round_label, match_code, note } = req.body;
    const result = await pool.query(
      `UPDATE fixtures SET
        status = COALESCE($1, status),
        scheduled_at = COALESCE($2, scheduled_at),
        round_label = COALESCE($3, round_label),
        match_code = COALESCE($4, match_code),
        note = COALESCE($5, note)
       WHERE id=$6 RETURNING *`,
      [status || null, scheduled_at || null, round_label || null, match_code || null, note || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Fixture not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send reminder email for a fixture (admin)
router.post('/:id/remind', adminMiddleware, async (req, res) => {
  try {
    const fixRes = await pool.query(
      `SELECT f.*, u1.username as p1name, u1.email as p1email, u2.username as p2name, u2.email as p2email, t.name as tname
       FROM fixtures f
       JOIN users u1 ON u1.id=f.player1_id JOIN users u2 ON u2.id=f.player2_id JOIN tournaments t ON t.id=f.tournament_id
       WHERE f.id=$1`, [req.params.id]
    );
    if (!fixRes.rows.length) return res.status(404).json({ error: 'Fixture not found' });
    const f = fixRes.rows[0];
    const matchDate = new Date(f.scheduled_at).toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos' });

    const baseWrapper = c => `<div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;border-radius:12px"><div style="text-align:center;margin-bottom:28px"><h1 style="color:#00e676;font-size:26px;letter-spacing:3px;margin:0">UNCLESCAR <span style="color:#f0f4ff">STUDIOS</span></h1></div>${c}<hr style="border:1px solid #1e2d45;margin:32px 0"><p style="color:#6b7a99;font-size:11px;text-align:center">&copy; 2026 Unclescar Studios</p></div>`;
    const reminderHtml = (pname, oname) => baseWrapper(`
      <h2 style="color:#ffc107">⏰ Match Reminder</h2>
      <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${pname}</strong>, this is a reminder that your match against <strong style="color:#f0f4ff">${oname}</strong> is coming up soon!</p>
      <div style="background:#0f1623;border:2px solid #ffc107;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
        <div style="color:#ffc107;font-size:.78rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Scheduled</div>
        <div style="font-size:1.3rem;font-weight:700;color:#ffc107">${matchDate}</div>
        ${f.match_code ? `<div style="margin-top:14px;color:#6b7a99;font-size:.85rem">Lobby Code: <strong style="font-family:monospace;font-size:1.1rem;letter-spacing:3px;color:#00e676">${f.match_code}</strong></div>` : ''}
      </div>
      <div style="text-align:center"><a href="${APP_URL()}/fixtures.html" style="background:#ffc107;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;text-transform:uppercase">View Fixtures</a></div>`);

    await Promise.all([
      sendEmail({ to: f.p1email, subject: `⏰ Match Reminder: vs ${f.p2name} — ${f.tname}`, html: reminderHtml(f.p1name, f.p2name) }),
      sendEmail({ to: f.p2email, subject: `⏰ Match Reminder: vs ${f.p1name} — ${f.tname}`, html: reminderHtml(f.p2name, f.p1name) })
    ]);

    await pool.query('UPDATE fixtures SET reminder_sent=true WHERE id=$1', [req.params.id]);

    // In-app notifications
    await Promise.all([
      createNotification(f.player1_id, 'reminder', `⏰ Match Reminder: ${f.tname}`, `Your match vs ${f.p2name} is at ${matchDate}`, '/fixtures.html'),
      createNotification(f.player2_id, 'reminder', `⏰ Match Reminder: ${f.tname}`, `Your match vs ${f.p1name} is at ${matchDate}`, '/fixtures.html')
    ]);

    res.json({ success: true, message: `Reminder sent to ${f.p1name} and ${f.p2name}` });
  } catch (err) {
    console.error('Reminder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete fixture (admin)
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM fixtures WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
