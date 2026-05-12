const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { verifyMatchScreenshot } = require('../gemini');

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
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Images only'));
  }
});

// Submit match result
router.post('/submit', authMiddleware, upload.single('screenshot'), async (req, res) => {
  try {
    const { tournament_id, opponent_id, my_score, opponent_score } = req.body;
    if (!tournament_id || !opponent_id || my_score === undefined || opponent_score === undefined) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (!req.file) return res.status(400).json({ error: 'Screenshot required' });

    // Verify both are registered
    const myReg = await pool.query(
      'SELECT * FROM registrations WHERE tournament_id=$1 AND user_id=$2 AND payment_status=$3',
      [tournament_id, req.user.id, 'paid']
    );
    if (!myReg.rows.length) return res.status(403).json({ error: 'You are not registered in this tournament' });

    const oppUser = await pool.query('SELECT username FROM users WHERE id=$1', [opponent_id]);
    if (!oppUser.rows.length) return res.status(404).json({ error: 'Opponent not found' });

    const myUser = await pool.query('SELECT username FROM users WHERE id=$1', [req.user.id]);

    const screenshotPath = req.file.path;

    // Run Gemini AI verification
    const aiResult = await verifyMatchScreenshot(
      screenshotPath,
      myUser.rows[0].username,
      oppUser.rows[0].username,
      parseInt(my_score),
      parseInt(opponent_score)
    );

    const status = aiResult.verified && aiResult.scores_match_claim ? 'ai_approved' : 'pending_review';

    const result = await pool.query(
      `INSERT INTO match_results 
       (tournament_id, submitter_id, opponent_id, submitter_score, opponent_score, screenshot_path, ai_verified, ai_result, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        tournament_id, req.user.id, opponent_id,
        parseInt(my_score), parseInt(opponent_score),
        screenshotPath, aiResult.verified, JSON.stringify(aiResult), status
      ]
    );

    // If AI approved with high confidence, auto-update standings
    if (status === 'ai_approved' && aiResult.confidence === 'high') {
      await updateStandings(tournament_id, req.user.id, opponent_id, parseInt(my_score), parseInt(opponent_score));
    }

    res.json({ success: true, result: result.rows[0], ai: aiResult, status });
  } catch (err) {
    console.error(err);
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
       WHERE mr.tournament_id=$1 ORDER BY mr.submitted_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: approve / reject a match result
router.patch('/:id/review', adminMiddleware, async (req, res) => {
  try {
    const { approved } = req.body;
    const match = await pool.query('SELECT * FROM match_results WHERE id=$1', [req.params.id]);
    if (!match.rows.length) return res.status(404).json({ error: 'Not found' });
    const m = match.rows[0];

    const newStatus = approved ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE match_results SET admin_approved=$1, status=$2 WHERE id=$3',
      [approved, newStatus, req.params.id]
    );

    if (approved) {
      await updateStandings(m.tournament_id, m.submitter_id, m.opponent_id, m.submitter_score, m.opponent_score);
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending reviews for admin
router.get('/pending', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mr.*, u1.username as submitter_name, u2.username as opponent_name, t.name as tournament_name
       FROM match_results mr
       JOIN users u1 ON u1.id = mr.submitter_id
       JOIN users u2 ON u2.id = mr.opponent_id
       JOIN tournaments t ON t.id = mr.tournament_id
       WHERE mr.status IN ('pending_review') ORDER BY mr.submitted_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function updateStandings(tournamentId, winnerId, loserId, winnerGoals, loserGoals) {
  try {
    const tournament = await pool.query('SELECT format FROM tournaments WHERE id=$1', [tournamentId]);
    const format = tournament.rows[0]?.format;

    if (winnerGoals > loserGoals) {
      // Winner
      await pool.query(
        `UPDATE bracket_entries SET wins=wins+1, points=points+3, goals_for=goals_for+$1, goals_against=goals_against+$2
         WHERE tournament_id=$3 AND user_id=$4`,
        [winnerGoals, loserGoals, tournamentId, winnerId]
      );
      // Loser
      await pool.query(
        `UPDATE bracket_entries SET losses=losses+1, goals_for=goals_for+$1, goals_against=goals_against+$2
         WHERE tournament_id=$3 AND user_id=$4`,
        [loserGoals, winnerGoals, tournamentId, loserId]
      );
      // Knockout: mark loser eliminated
      if (format && format.includes('elimination')) {
        await pool.query(
          'UPDATE bracket_entries SET eliminated=true WHERE tournament_id=$1 AND user_id=$2',
          [tournamentId, loserId]
        );
      }
    } else if (winnerGoals === loserGoals) {
      // Draw (both get 1 point)
      for (const [uid, gf, ga] of [[winnerId, winnerGoals, loserGoals], [loserId, loserGoals, winnerGoals]]) {
        await pool.query(
          `UPDATE bracket_entries SET draws=draws+1, points=points+1, goals_for=goals_for+$1, goals_against=goals_against+$2
           WHERE tournament_id=$3 AND user_id=$4`,
          [gf, ga, tournamentId, uid]
        );
      }
    }
  } catch (err) {
    console.error('Standings update error:', err.message);
  }
}

module.exports = router;
