const { logAction } = require('../adminLogger');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { sendPayoutEmail } = require('../email');

const PAYSTACK_SECRET = () => process.env.PAYSTACK_SECRET_KEY;
const psHeaders = () => ({ Authorization: `Bearer ${PAYSTACK_SECRET()}` });

// ─── PUBLIC/PLAYER ROUTES ─────────────────────────────────────────────────────

// List all Nigerian banks from Paystack
router.get('/banks', async (req, res) => {
  try {
    const response = await axios.get('https://api.paystack.co/bank?country=nigeria&perPage=100', {
      headers: psHeaders()
    });
    res.json(response.data.data);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch banks. Try again.' });
  }
});

// Verify a bank account number
router.get('/verify-account', authMiddleware, async (req, res) => {
  try {
    const { account_number, bank_code } = req.query;
    if (!account_number || !bank_code) return res.status(400).json({ error: 'account_number and bank_code required' });
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      { headers: psHeaders() }
    );
    res.json(response.data.data);
  } catch (err) {
    const msg = err.response?.data?.message || 'Could not verify account. Check the details and try again.';
    res.status(400).json({ error: msg });
  }
});

// Save / update bank account
router.post('/account', authMiddleware, async (req, res) => {
  try {
    const { account_number, bank_code, bank_name, account_name } = req.body;
    if (!account_number || !bank_code || !bank_name || !account_name) {
      return res.status(400).json({ error: 'All bank account fields are required' });
    }

    // Create or update Paystack transfer recipient
    let recipientCode = null;
    try {
      const recRes = await axios.post('https://api.paystack.co/transferrecipient', {
        type: 'nuban',
        name: account_name,
        account_number,
        bank_code,
        currency: 'NGN'
      }, { headers: psHeaders() });
      recipientCode = recRes.data.data.recipient_code;
    } catch (e) {
      console.warn('Recipient creation failed:', e.response?.data?.message || e.message);
    }

    const existing = await pool.query('SELECT id FROM bank_accounts WHERE user_id=$1', [req.user.id]);
    let result;
    if (existing.rows.length) {
      result = await pool.query(
        `UPDATE bank_accounts SET account_number=$1, bank_code=$2, bank_name=$3, account_name=$4,
         recipient_code=$5, verified=true, updated_at=NOW() WHERE user_id=$6 RETURNING *`,
        [account_number, bank_code, bank_name, account_name, recipientCode, req.user.id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO bank_accounts (user_id, account_number, bank_code, bank_name, account_name, recipient_code, verified)
         VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
        [req.user.id, account_number, bank_code, bank_name, account_name, recipientCode]
      );
    }

    res.json({ success: true, account: result.rows[0] });
  } catch (err) {
    console.error('Save bank account error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get my bank account
router.get('/my-account', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bank_accounts WHERE user_id=$1', [req.user.id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my payout history
router.get('/my-payouts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, t.name as tournament_name, t.arena FROM payouts p
       JOIN tournaments t ON t.id = p.tournament_id
       WHERE p.user_id = $1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// Get prize pool for a tournament
router.get('/prize-pool/:tournament_id', adminMiddleware, async (req, res) => {
  try {
    const [pool_res, standings_res, paid_res] = await Promise.all([
      pool.query('SELECT * FROM prize_pools WHERE tournament_id=$1', [req.params.tournament_id]),
      pool.query(
        `SELECT be.user_id, u.username, u.email, be.points, be.wins, be.draws, be.losses,
                ba.account_name, ba.bank_name, ba.account_number, ba.recipient_code, ba.verified as bank_verified
         FROM bracket_entries be
         JOIN users u ON u.id = be.user_id
         LEFT JOIN bank_accounts ba ON ba.user_id = be.user_id
         WHERE be.tournament_id=$1
         ORDER BY be.points DESC, be.goal_diff DESC, be.goals_for DESC`,
        [req.params.tournament_id]
      ),
      pool.query('SELECT * FROM payouts WHERE tournament_id=$1', [req.params.tournament_id])
    ]);

    const prizePool = pool_res.rows[0] || null;
    const standings = standings_res.rows;
    const existingPayouts = paid_res.rows;

    const payoutMap = {};
    existingPayouts.forEach(p => { payoutMap[p.user_id] = p; });

    const enriched = standings.map((s, i) => ({
      ...s,
      position: i + 1,
      payout: payoutMap[s.user_id] || null
    }));

    const tourney = await pool.query(
      `SELECT t.*, COUNT(r.id) as registered, SUM(t.entry_fee) as gross_pool
       FROM tournaments t
       LEFT JOIN registrations r ON r.tournament_id = t.id AND r.payment_status='paid'
       WHERE t.id=$1 GROUP BY t.id`,
      [req.params.tournament_id]
    );

    res.json({
      tournament: tourney.rows[0],
      prize_pool: prizePool,
      standings: enriched,
      payouts: existingPayouts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set up / update prize pool positions
router.post('/prize-pool/:tournament_id', adminMiddleware, async (req, res) => {
  try {
    const { positions, platform_cut_pct } = req.body;
    if (!positions || typeof positions !== 'object') {
      return res.status(400).json({ error: 'positions must be an object e.g. {"1": 5000, "2": 2000}' });
    }
    const total = Object.values(positions).reduce((a, b) => a + parseInt(b || 0), 0);
    const cutPct = parseInt(platform_cut_pct || 10);

    const existing = await pool.query('SELECT id FROM prize_pools WHERE tournament_id=$1', [req.params.tournament_id]);
    if (existing.rows.length) {
      await pool.query(
        'UPDATE prize_pools SET positions=$1, total_amount=$2, platform_cut_pct=$3, updated_at=NOW() WHERE tournament_id=$4',
        [JSON.stringify(positions), total, cutPct, req.params.tournament_id]
      );
    } else {
      await pool.query(
        'INSERT INTO prize_pools (tournament_id, positions, total_amount, platform_cut_pct) VALUES ($1,$2,$3,$4)',
        [req.params.tournament_id, JSON.stringify(positions), total, cutPct]
      );
    }

    res.json({ success: true, total, positions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send payout to a single player
router.post('/send/:tournament_id/:user_id', adminMiddleware, async (req, res) => {
  try {
    const { tournament_id, user_id } = req.params;
    const { position, amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

    const bankRes = await pool.query(
      'SELECT * FROM bank_accounts WHERE user_id=$1 AND verified=true', [user_id]
    );
    if (!bankRes.rows.length) {
      return res.status(400).json({ error: 'Player has no verified bank account on file' });
    }
    const bank = bankRes.rows[0];

    if (!bank.recipient_code) {
      return res.status(400).json({ error: 'Player bank account has no Paystack recipient code. Ask them to re-save their account.' });
    }

    const userRes = await pool.query('SELECT username, email FROM users WHERE id=$1', [user_id]);
    const tRes = await pool.query('SELECT name FROM tournaments WHERE id=$1', [tournament_id]);
    const user = userRes.rows[0];
    const tournamentName = tRes.rows[0]?.name || 'Tournament';

    // Check if already paid
    const existing = await pool.query(
      "SELECT * FROM payouts WHERE tournament_id=$1 AND user_id=$2 AND status='sent'",
      [tournament_id, user_id]
    );
    if (existing.rows.length) return res.status(400).json({ error: 'Payout already sent to this player' });

    // Initiate Paystack transfer
    const reference = `gameday-payout-${tournament_id.slice(0, 8)}-${user_id.slice(0, 8)}-${Date.now()}`;
    const transferRes = await axios.post('https://api.paystack.co/transfer', {
      source: 'balance',
      amount: parseInt(amount) * 100, // kobo
      recipient: bank.recipient_code,
      reason: `Prize payout: ${tournamentName} - Position ${position}`,
      reference
    }, { headers: psHeaders() });

    const transfer = transferRes.data.data;
    const isPending = transfer.status === 'pending' || transfer.status === 'otp';

    await pool.query(
      `INSERT INTO payouts (tournament_id, user_id, position, amount, status, transfer_code, transfer_reference, initiated_by, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tournament_id, user_id) DO UPDATE
       SET status=$5, transfer_code=$6, transfer_reference=$7, initiated_by=$8, paid_at=$9`,
      [tournament_id, user_id, position || 0, amount, isPending ? 'processing' : 'sent',
       transfer.transfer_code, reference, req.user.id, new Date()]
    );

    // Notify player by email
    sendPayoutEmail(user, tournamentName, amount, position, bank.account_name, bank.bank_name)
      .catch(e => console.warn('Payout email failed:', e.message));

    logAction(req.user.id, 'SEND_PAYOUT', { player: user.username, amount, position, tournament: tournamentName }, req.ip).catch(() => {});
    res.json({ success: true, status: transfer.status, reference, amount });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('Payout error:', msg);

    // Log failed attempt
    try {
      await pool.query(
        `INSERT INTO payouts (tournament_id, user_id, position, amount, status, failure_reason, initiated_by)
         VALUES ($1,$2,$3,$4,'failed',$5,$6)
         ON CONFLICT (tournament_id, user_id) DO UPDATE SET status='failed', failure_reason=$5`,
        [req.params.tournament_id, req.params.user_id, req.body.position || 0, req.body.amount || 0, msg, req.user.id]
      );
    } catch {}

    res.status(400).json({ error: msg });
  }
});

// Send all pending payouts for a tournament
router.post('/send-all/:tournament_id', adminMiddleware, async (req, res) => {
  try {
    const { tournament_id } = req.params;
    const poolRes = await pool.query('SELECT * FROM prize_pools WHERE tournament_id=$1', [tournament_id]);
    if (!poolRes.rows.length) return res.status(400).json({ error: 'No prize pool set up for this tournament' });

    const prizePool = poolRes.rows[0];
    const positions = prizePool.positions;

    const standings = await pool.query(
      `SELECT be.user_id, u.username, u.email, ba.recipient_code, ba.account_name, ba.bank_name, ba.verified as bank_verified
       FROM bracket_entries be
       JOIN users u ON u.id = be.user_id
       LEFT JOIN bank_accounts ba ON ba.user_id = be.user_id
       WHERE be.tournament_id=$1
       ORDER BY be.points DESC, be.goal_diff DESC, be.goals_for DESC`,
      [tournament_id]
    );

    const tRes = await pool.query('SELECT name FROM tournaments WHERE id=$1', [tournament_id]);
    const tournamentName = tRes.rows[0]?.name || 'Tournament';

    const results = [];
    for (let i = 0; i < standings.rows.length; i++) {
      const player = standings.rows[i];
      const position = i + 1;
      const amount = positions[String(position)];

      if (!amount || parseInt(amount) <= 0) continue;

      const alreadyPaid = await pool.query(
        "SELECT id FROM payouts WHERE tournament_id=$1 AND user_id=$2 AND status IN ('sent','processing')",
        [tournament_id, player.user_id]
      );
      if (alreadyPaid.rows.length) { results.push({ username: player.username, position, status: 'already_paid' }); continue; }

      if (!player.recipient_code || !player.bank_verified) {
        results.push({ username: player.username, position, status: 'no_bank_account', amount });
        await pool.query(
          `INSERT INTO payouts (tournament_id, user_id, position, amount, status, failure_reason, initiated_by)
           VALUES ($1,$2,$3,$4,'failed',$5,$6)
           ON CONFLICT (tournament_id, user_id) DO UPDATE SET status='failed', failure_reason=$5`,
          [tournament_id, player.user_id, position, amount, 'No verified bank account', req.user.id]
        );
        continue;
      }

      try {
        const reference = `gameday-payout-${tournament_id.slice(0,8)}-${player.user_id.slice(0,8)}-${Date.now()}`;
        const transferRes = await axios.post('https://api.paystack.co/transfer', {
          source: 'balance',
          amount: parseInt(amount) * 100,
          recipient: player.recipient_code,
          reason: `Prize payout: ${tournamentName} - Position ${position}`,
          reference
        }, { headers: psHeaders() });

        const transfer = transferRes.data.data;
        await pool.query(
          `INSERT INTO payouts (tournament_id, user_id, position, amount, status, transfer_code, transfer_reference, initiated_by, paid_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
           ON CONFLICT (tournament_id, user_id) DO UPDATE SET status=$5, transfer_code=$6, transfer_reference=$7, paid_at=NOW()`,
          [tournament_id, player.user_id, position, amount, 'processing', transfer.transfer_code, reference, req.user.id]
        );

        sendPayoutEmail({ username: player.username, email: player.email }, tournamentName, amount, position, player.account_name, player.bank_name)
          .catch(() => {});

        results.push({ username: player.username, position, status: 'sent', amount });
      } catch (err) {
        const msg = err.response?.data?.message || err.message;
        results.push({ username: player.username, position, status: 'failed', error: msg, amount });
        await pool.query(
          `INSERT INTO payouts (tournament_id, user_id, position, amount, status, failure_reason, initiated_by)
           VALUES ($1,$2,$3,$4,'failed',$5,$6)
           ON CONFLICT (tournament_id, user_id) DO UPDATE SET status='failed', failure_reason=$5`,
          [tournament_id, player.user_id, position, amount, msg, req.user.id]
        );
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All payouts across all tournaments
router.get('/all', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.email, t.name as tournament_name, t.arena
       FROM payouts p
       JOIN users u ON u.id = p.user_id
       JOIN tournaments t ON t.id = p.tournament_id
       ORDER BY p.created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
