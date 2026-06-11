const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { verifyMatchScreenshot } = require('../gemini');
const { sendAdminMatchNotification, sendEmail } = require('../email');
const { createNotification } = require('../notifHelper');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `match-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png|webp/i.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Images only (JPG, PNG, WEBP)'));
  }
});
const disputeUpload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Submit match result
router.post('/submit', authMiddleware, upload.single('screenshot'), async (req, res) => {
  try {
    const { tournament_id, opponent_id, my_score, opponent_score } = req.body;
    if (!tournament_id || !opponent_id || my_score === undefined || opponent_score === undefined) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (!req.file) return res.status(400).json({ error: 'Screenshot is required' });

    const myReg = await pool.query(
      "SELECT * FROM registrations WHERE tournament_id=$1 AND user_id=$2 AND payment_status='paid'",
      [tournament_id, req.user.id]
    );
    if (!myReg.rows.length) return res.status(403).json({ error: 'You are not registered in this tournament' });

    const [myUser, oppUser, tData] = await Promise.all([
      pool.query('SELECT id, username, email FROM users WHERE id=$1', [req.user.id]),
      pool.query('SELECT id, username, email FROM users WHERE id=$1', [opponent_id]),
      pool.query('SELECT name FROM tournaments WHERE id=$1', [tournament_id])
    ]);
    if (!oppUser.rows.length) return res.status(404).json({ error: 'Opponent not found' });

    const screenshotPath = req.file.path;
    const aiResult = await verifyMatchScreenshot(
      screenshotPath, myUser.rows[0].username, oppUser.rows[0].username,
      parseInt(my_score), parseInt(opponent_score)
    );

    const status = aiResult.verified && aiResult.scores_match_claim && aiResult.confidence === 'high'
      ? 'ai_approved' : 'pending_review';

    const result = await pool.query(
      `INSERT INTO match_results
       (tournament_id, submitter_id, opponent_id, submitter_score, opponent_score, screenshot_path, ai_verified, ai_result, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tournament_id, req.user.id, opponent_id,
        parseInt(my_score), parseInt(opponent_score),
        screenshotPath, aiResult.verified, JSON.stringify(aiResult), status]
    );

    const tournamentName = tData.rows[0]?.name || 'Tournament';
    const submitter = myUser.rows[0];
    const opponent = oppUser.rows[0];

    if (status === 'ai_approved') {
      await updateStandings(tournament_id, req.user.id, opponent_id, parseInt(my_score), parseInt(opponent_score));
      // Notify both players
      const winnerGoals = parseInt(my_score), loserGoals = parseInt(opponent_score);
      const submitterWon = winnerGoals > loserGoals;
      await Promise.all([
        createNotification(req.user.id, 'match', `✅ Result Approved: ${tournamentName}`,
          `Your ${my_score}–${opponent_score} result vs ${opponent.username} was auto-approved.`, '/dashboard.html'),
        createNotification(opponent_id, 'match', `📊 Match Result Recorded: ${tournamentName}`,
          `${submitter.username} submitted a result: ${my_score}–${opponent_score}. Your standings have been updated.`, '/dashboard.html')
      ]);
    } else {
      sendAdminMatchNotification(submitter, opponent, tournamentName, result.rows[0])
        .catch(e => console.warn('Admin notification failed:', e.message));
      await createNotification(req.user.id, 'match', `⏳ Result Pending Review: ${tournamentName}`,
        `Your ${my_score}–${opponent_score} result vs ${opponent.username} is under admin review.`, '/dashboard.html');
    }

    res.json({ success: true, result: result.rows[0], ai: aiResult, status });
  } catch (err) {
    console.error('Submit match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get matches for a tournament
router.get('/tournament/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mr.*, u1.username as submitter_name, u2.username as opponent_name
       FROM match_results mr
       JOIN users u1 ON u1.id = mr.submitter_id
       JOIN users u2 ON u2.id = mr.opponent_id
       WHERE mr.tournament_id=$1 AND mr.status IN ('approved','ai_approved')
       ORDER BY mr.submitted_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: get pending reviews
router.get('/pending', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mr.*, u1.username as submitter_name, u2.username as opponent_name, t.name as tournament_name
       FROM match_results mr
       JOIN users u1 ON u1.id = mr.submitter_id
       JOIN users u2 ON u2.id = mr.opponent_id
       JOIN tournaments t ON t.id = mr.tournament_id
       WHERE mr.status = 'pending_review'
       ORDER BY mr.submitted_at ASC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: approve or reject
router.patch('/:id/review', adminMiddleware, async (req, res) => {
  try {
    const { approved } = req.body;
    const match = await pool.query('SELECT * FROM match_results WHERE id=$1', [req.params.id]);
    if (!match.rows.length) return res.status(404).json({ error: 'Not found' });
    const m = match.rows[0];

    const newStatus = approved ? 'approved' : 'rejected';
    await pool.query('UPDATE match_results SET admin_approved=$1, status=$2 WHERE id=$3', [approved, newStatus, req.params.id]);

    if (approved) {
      await updateStandings(m.tournament_id, m.submitter_id, m.opponent_id, m.submitter_score, m.opponent_score);
    }

    // Notify both players
    const [sub, opp, t] = await Promise.all([
      pool.query('SELECT username FROM users WHERE id=$1', [m.submitter_id]),
      pool.query('SELECT username FROM users WHERE id=$1', [m.opponent_id]),
      pool.query('SELECT name FROM tournaments WHERE id=$1', [m.tournament_id])
    ]);
    const tname = t.rows[0]?.name || 'Tournament';
    const subName = sub.rows[0]?.username || 'Player';
    const oppName = opp.rows[0]?.username || 'Opponent';

    if (approved) {
      await Promise.all([
        createNotification(m.submitter_id, 'match', `✅ Result Approved: ${tname}`,
          `Your ${m.submitter_score}–${m.opponent_score} result vs ${oppName} has been approved.`, '/dashboard.html'),
        createNotification(m.opponent_id, 'match', `📊 Match Result Approved: ${tname}`,
          `${subName}'s ${m.submitter_score}–${m.opponent_score} result has been approved. Standings updated.`, '/dashboard.html')
      ]);
    } else {
      await createNotification(m.submitter_id, 'match', `❌ Result Rejected: ${tname}`,
        `Your ${m.submitter_score}–${m.opponent_score} result vs ${oppName} was rejected. Check the rulebook.`, '/rules.html');
    }

    res.json({ success: true, status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Submit a dispute
router.post('/:id/dispute', authMiddleware, disputeUpload.single('evidence'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 10) return res.status(400).json({ error: 'Please provide a detailed reason (min 10 characters)' });

    const match = await pool.query('SELECT * FROM match_results WHERE id=$1', [req.params.id]);
    if (!match.rows.length) return res.status(404).json({ error: 'Match not found' });
    const m = match.rows[0];

    if (m.submitter_id !== req.user.id && m.opponent_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not part of this match' });
    }

    // Check not already disputed
    const existing = await pool.query('SELECT id FROM disputes WHERE match_result_id=$1 AND raised_by=$2', [req.params.id, req.user.id]);
    if (existing.rows.length) return res.status(400).json({ error: 'You have already raised a dispute for this match' });

    const evidencePath = req.file ? req.file.path : null;
    const result = await pool.query(
      `INSERT INTO disputes (match_result_id, tournament_id, raised_by, reason, evidence_path)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, m.tournament_id, req.user.id, reason.trim(), evidencePath]
    );

    // Mark match as disputed
    await pool.query("UPDATE match_results SET status='disputed' WHERE id=$1 AND status IN ('ai_approved','approved')", [req.params.id]);

    // Notify admin via in-app (create admin notification — notify all admins)
    const admins = await pool.query("SELECT id FROM users WHERE role='admin'");
    for (const admin of admins.rows) {
      await createNotification(admin.id, 'dispute', `⚠ New Dispute Filed`, `A player has disputed a match result in tournament.`, '/admin.html');
    }
    await createNotification(req.user.id, 'dispute', `⚠ Dispute Submitted`, `Your dispute has been received. Admin will review it shortly.`, '/dashboard.html');

    res.json({ success: true, dispute: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get my submitted matches
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mr.*, u2.username as opponent_name, t.name as tournament_name
       FROM match_results mr
       JOIN users u2 ON u2.id = mr.opponent_id
       JOIN tournaments t ON t.id = mr.tournament_id
       WHERE mr.submitter_id=$1
       ORDER BY mr.submitted_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function updateStandings(tournamentId, winnerId, loserId, winnerGoals, loserGoals) {
  try {
    const tournament = await pool.query('SELECT format FROM tournaments WHERE id=$1', [tournamentId]);
    const format = tournament.rows[0]?.format || '';

    if (winnerGoals > loserGoals) {
      await pool.query(
        `UPDATE bracket_entries SET wins=wins+1, points=points+3, goals_for=goals_for+$1, goals_against=goals_against+$2
         WHERE tournament_id=$3 AND user_id=$4`,
        [winnerGoals, loserGoals, tournamentId, winnerId]
      );
      await pool.query(
        `UPDATE bracket_entries SET losses=losses+1, goals_for=goals_for+$1, goals_against=goals_against+$2
         WHERE tournament_id=$3 AND user_id=$4`,
        [loserGoals, winnerGoals, tournamentId, loserId]
      );
      if (format.includes('elimination')) {
        await pool.query('UPDATE bracket_entries SET eliminated=true WHERE tournament_id=$1 AND user_id=$2', [tournamentId, loserId]);
      }
    } else if (winnerGoals === loserGoals) {
      for (const [uid, gf, ga] of [[winnerId, winnerGoals, loserGoals], [loserId, loserGoals, winnerGoals]]) {
        await pool.query(
          `UPDATE bracket_entries SET draws=draws+1, points=points+1, goals_for=goals_for+$1, goals_against=goals_against+$2
           WHERE tournament_id=$3 AND user_id=$4`,
          [gf, ga, tournamentId, uid]
        );
      }
    }
  } catch (err) { console.error('Standings update error:', err.message); }
}

module.exports = router;
