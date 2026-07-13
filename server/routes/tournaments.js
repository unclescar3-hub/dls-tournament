const { logAction } = require('../adminLogger');
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const axios = require('axios');
const { sendAdminRegistrationNotification } = require('../email');

// Get all tournaments (optionally filtered by arena)
router.get('/', async (req, res) => {
  try {
    const { arena } = req.query;
    let q, params;
    if (arena) {
      q = `SELECT t.*, COUNT(r.id) as registered FROM tournaments t
           LEFT JOIN registrations r ON r.tournament_id = t.id AND r.payment_status='paid'
           WHERE t.arena=$1 GROUP BY t.id ORDER BY t.created_at DESC`;
      params = [arena];
    } else {
      q = `SELECT t.*, COUNT(r.id) as registered FROM tournaments t
           LEFT JOIN registrations r ON r.tournament_id = t.id AND r.payment_status='paid'
           GROUP BY t.id ORDER BY t.created_at DESC`;
      params = [];
    }
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// My registrations
router.get('/my/registrations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, t.name, t.arena, t.format, t.entry_fee, t.status as tournament_status
       FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.user_id=$1 ORDER BY r.registered_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single tournament with standings
router.get('/:id', async (req, res) => {
  try {
    const t = await pool.query('SELECT * FROM tournaments WHERE id=$1', [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'Not found' });
    const standings = await pool.query(
      `SELECT be.*, u.username, u.last_active FROM bracket_entries be
       JOIN users u ON u.id = be.user_id
       WHERE be.tournament_id=$1
       ORDER BY be.points DESC, be.goal_diff DESC, be.goals_for DESC`,
      [req.params.id]
    );
    res.json({ tournament: t.rows[0], standings: standings.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: create tournament
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { name, arena, format, max_players, entry_fee, is_unlimited } = req.body;
    if (!name || !arena || !format || entry_fee === undefined) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const unlimited = is_unlimited === true || is_unlimited === 'true';
    const maxP = unlimited ? 999999 : (parseInt(max_players) || 32);
    const result = await pool.query(
      'INSERT INTO tournaments (name, arena, format, max_players, entry_fee, created_by, is_unlimited) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, arena, format, maxP, parseInt(entry_fee), req.user.id, unlimited]
    );
    logAction(req.user.id, 'CREATE_TOURNAMENT', { name, arena, format, entry_fee, is_unlimited: unlimited }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update status
router.patch('/:id', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['open', 'ongoing', 'closed', 'completed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await pool.query('UPDATE tournaments SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    logAction(req.user.id, 'UPDATE_TOURNAMENT', { tournament_id: req.params.id, new_status: status }, req.ip).catch(() => {});
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete tournament
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const t = await pool.query('SELECT name FROM tournaments WHERE id=$1', [req.params.id]);
    await pool.query('DELETE FROM tournaments WHERE id=$1', [req.params.id]);
    logAction(req.user.id, 'DELETE_TOURNAMENT', { tournament_id: req.params.id, name: t.rows[0]?.name }, req.ip).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: complete free registration
async function completeFreeRegistration(tournamentId, userId) {
  await pool.query(
    `INSERT INTO registrations (tournament_id, user_id, paystack_ref, payment_status)
     VALUES ($1,$2,'FREE','paid')
     ON CONFLICT (tournament_id, user_id) DO UPDATE SET payment_status='paid'`,
    [tournamentId, userId]
  );
  await pool.query(
    'INSERT INTO bracket_entries (tournament_id, user_id) VALUES ($1,$2) ON CONFLICT (tournament_id, user_id) DO NOTHING',
    [tournamentId, userId]
  );
}

// Initialize payment (Paystack for NGN / free tournaments)
router.post('/:id/pay', authMiddleware, async (req, res) => {
  try {
    const tournament = await pool.query('SELECT * FROM tournaments WHERE id=$1', [req.params.id]);
    if (!tournament.rows.length) return res.status(404).json({ error: 'Tournament not found' });
    const t = tournament.rows[0];
    if (t.status !== 'open') return res.status(400).json({ error: 'Tournament is not open for registration' });

    const existing = await pool.query(
      "SELECT * FROM registrations WHERE tournament_id=$1 AND user_id=$2",
      [t.id, req.user.id]
    );
    if (existing.rows.length && existing.rows[0].payment_status === 'paid') {
      return res.status(400).json({ error: 'You are already registered for this tournament' });
    }

    const count = await pool.query(
      "SELECT COUNT(*) FROM registrations WHERE tournament_id=$1 AND payment_status='paid'",
      [t.id]
    );
    if (!t.is_unlimited && parseInt(count.rows[0].count) >= t.max_players) {
      return res.status(400).json({ error: 'Tournament is full' });
    }

    // FREE TOURNAMENT — no payment needed
    if (!t.entry_fee || parseInt(t.entry_fee) === 0) {
      await completeFreeRegistration(t.id, req.user.id);
      logAction(req.user.id, 'FREE_REGISTRATION', { tournament_id: t.id, tournament_name: t.name }, '').catch(() => {});
      return res.json({ free: true, success: true });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const user = userResult.rows[0];
    const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const callbackUrl = `${appUrl}/api/tournaments/${t.id}/verify`;

    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email: user.email,
      amount: t.entry_fee * 100,
      callback_url: callbackUrl,
      metadata: { tournament_id: t.id, user_id: req.user.id, tournament_name: t.name, arena: t.arena }
    }, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });

    const { reference, authorization_url } = response.data.data;

    await pool.query(
      `INSERT INTO registrations (tournament_id, user_id, paystack_ref, payment_status)
       VALUES ($1,$2,$3,'pending')
       ON CONFLICT (tournament_id, user_id) DO UPDATE SET paystack_ref=$3, payment_status='pending'`,
      [t.id, req.user.id, reference]
    );

    res.json({ authorization_url, reference });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// Paystack callback
router.get('/:id/verify', async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.redirect('/dashboard.html?error=no_reference');

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });

    const data = response.data.data;
    if (data.status !== 'success') return res.redirect('/dashboard.html?error=payment_failed');

    const reg = await pool.query(
      "UPDATE registrations SET payment_status='paid' WHERE paystack_ref=$1 RETURNING *",
      [reference]
    );

    if (reg.rows.length) {
      const r = reg.rows[0];
      await pool.query(
        'INSERT INTO bracket_entries (tournament_id, user_id) VALUES ($1,$2) ON CONFLICT (tournament_id, user_id) DO NOTHING',
        [r.tournament_id, r.user_id]
      );

      // ── Referral cash reward for paid registrations ────────────────────────
      try {
        const userInfo = await pool.query('SELECT id, username, email, referred_by FROM users WHERE id=$1', [r.user_id]);
        const u = userInfo.rows[0];
        if (u && u.referred_by) {
          // Count total paid referrals this referrer has
          const paidCount = await pool.query(
            `SELECT COUNT(DISTINCT u2.id) FROM users u2
             JOIN registrations r2 ON r2.user_id = u2.id
             WHERE u2.referred_by=$1 AND r2.payment_status='paid'`,
            [u.referred_by]
          );
          const totalPaid = parseInt(paidCount.rows[0].count) || 0;

          // Find the highest tier the referrer qualifies for
          const tiers = await pool.query(
            'SELECT * FROM referral_tiers WHERE min_referrals <= $1 ORDER BY min_referrals DESC LIMIT 1',
            [totalPaid]
          );
          if (tiers.rows.length) {
            const tier = tiers.rows[0];
            await pool.query(
              'UPDATE users SET referral_cash = COALESCE(referral_cash,0) + $1 WHERE id=$2',
              [tier.cash_reward, u.referred_by]
            );
            // In-app notification for referrer
            const { createNotification } = require('../notifHelper');
            createNotification(u.referred_by, 'announcement',
              '💰 Referral Cash Reward!',
              `A player you referred just paid for a tournament! You earned ₦${Number(tier.cash_reward).toLocaleString()} cash reward.`,
              '/dashboard.html'
            ).catch(() => {});
            // Email referrer
            const { sendReferralRewardEmail } = require('../email');
            const referrerUser = await pool.query('SELECT username, email FROM users WHERE id=$1', [u.referred_by]);
            if (referrerUser.rows.length) {
              sendReferralRewardEmail(referrerUser.rows[0], 'cash', tier.cash_reward).catch(() => {});
            }
          }
        }
      } catch (e) { console.warn('Referral reward failed:', e.message); }

      // Notify admin of new paid registration
      try {
        const [userRes, tRes] = await Promise.all([
          pool.query('SELECT username, email FROM users WHERE id=$1', [r.user_id]),
          pool.query('SELECT name, arena, entry_fee FROM tournaments WHERE id=$1', [r.tournament_id])
        ]);
        if (userRes.rows.length && tRes.rows.length) {
          sendAdminRegistrationNotification(userRes.rows[0], tRes.rows[0])
            .catch(e => console.warn('Admin reg notification failed:', e.message));
        }
      } catch {}
    }

    res.redirect('/dashboard.html?payment=success');
  } catch (err) {
    console.error(err.message);
    res.redirect('/dashboard.html?error=verification_failed');
  }
});

module.exports = router;
