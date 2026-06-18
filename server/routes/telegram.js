const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { sendTelegramMessage, isTelegramConfigured } = require('../telegram');

// Player: share an approved match result to the channel
router.post('/share-match', authMiddleware, async (req, res) => {
  try {
    const { match_id } = req.body;
    if (!match_id) return res.status(400).json({ error: 'match_id required' });

    if (!await isTelegramConfigured()) {
      return res.status(503).json({ error: 'Telegram channel not connected yet' });
    }

    const match = await pool.query(`
      SELECT mr.*, u1.username AS submitter_name, u2.username AS opponent_name, t.name AS tournament_name
      FROM match_results mr
      JOIN users u1 ON u1.id = mr.submitter_id
      JOIN users u2 ON u2.id = mr.opponent_id
      JOIN tournaments t ON t.id = mr.tournament_id
      WHERE mr.id=$1 AND (mr.submitter_id=$2 OR mr.opponent_id=$2)
        AND mr.status IN ('approved','ai_approved')
    `, [match_id, req.user.id]);

    if (!match.rows.length) {
      return res.status(404).json({ error: 'Match not found or result not yet approved' });
    }

    const m = match.rows[0];
    const winScore = Math.max(m.submitter_score, m.opponent_score);
    const loseScore = Math.min(m.submitter_score, m.opponent_score);
    const winner = m.submitter_score >= m.opponent_score ? m.submitter_name : m.opponent_name;
    const loser  = m.submitter_score >= m.opponent_score ? m.opponent_name  : m.submitter_name;

    const text = `🏆 <b>Game Day Royal Tournaments</b>\n\n` +
      `⚽ <b>${winner}</b> ${winScore} – ${loseScore} <b>${loser}</b>\n` +
      `🏟 <i>${m.tournament_name}</i>\n\n` +
      `GG! 🎮 Join the tournament at Game Day Royal.`;

    const result = await sendTelegramMessage(text);
    res.json({ success: true, message_id: result.result?.message_id });
  } catch (err) {
    console.error('[Telegram share]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin: broadcast a custom message to the channel
router.post('/broadcast', adminMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });

    if (!await isTelegramConfigured()) {
      return res.status(503).json({ error: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in Secrets.' });
    }

    const text = `📢 <b>Game Day Royal Tournaments</b>\n\n${message.trim()}`;
    const result = await sendTelegramMessage(text);
    res.json({ success: true, ok: result.ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: share a fixture announcement to the channel
router.post('/announce-fixture', adminMiddleware, async (req, res) => {
  try {
    const { fixture_id } = req.body;
    if (!fixture_id) return res.status(400).json({ error: 'fixture_id required' });

    if (!await isTelegramConfigured()) {
      return res.status(503).json({ error: 'Telegram not configured' });
    }

    const fx = await pool.query(`
      SELECT f.*, u1.username AS p1, u2.username AS p2, t.name AS tournament_name
      FROM fixtures f
      JOIN users u1 ON u1.id = f.player1_id
      JOIN users u2 ON u2.id = f.player2_id
      JOIN tournaments t ON t.id = f.tournament_id
      WHERE f.id=$1
    `, [fixture_id]);

    if (!fx.rows.length) return res.status(404).json({ error: 'Fixture not found' });
    const f = fx.rows[0];
    const matchDate = new Date(f.scheduled_at).toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos' });

    const text = `📅 <b>Match Fixture — ${f.tournament_name}</b>\n\n` +
      `⚔️ <b>${f.p1}</b> vs <b>${f.p2}</b>\n` +
      `${f.round_label ? `🎯 ${f.round_label}\n` : ''}` +
      `🕐 ${matchDate}\n\n` +
      `Stay tuned for the result! 🏆`;

    const result = await sendTelegramMessage(text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
