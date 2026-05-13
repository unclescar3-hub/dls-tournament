const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { register, login, signToken, authMiddleware } = require('../auth');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../email');
const pool = require('../db');

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Username, email and password are required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });

    const user = await register(username.trim(), email.trim().toLowerCase(), password, phone || '');
    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });

    // Send welcome email in background
    sendWelcomeEmail(user).catch(err => console.warn('Welcome email failed:', err.message));

    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint && err.constraint.includes('email')) return res.status(400).json({ error: 'Email already registered. Please log in.' });
      if (err.constraint && err.constraint.includes('username')) return res.status(400).json({ error: 'Username already taken. Choose another.' });
      return res.status(400).json({ error: 'Username or email already taken' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login (email or username)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email/username and password are required' });
    const user = await login(email.trim(), password);
    if (user.role === 'banned') return res.status(403).json({ error: 'Your account has been banned. Contact support.' });
    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Current user
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const result = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email.trim()]);
    // Always return success to prevent email enumeration
    if (!result.rows.length) return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });

    const user = result.rows[0];
    const token = crypto.randomBytes(48).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1,$2,$3)',
      [user.id, token, expires]
    );

    await sendPasswordResetEmail(user, token);
    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const reset = await pool.query(
      'SELECT * FROM password_resets WHERE token=$1 AND used=false AND expires_at > NOW()',
      [token]
    );
    if (!reset.rows.length) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

    const r = reset.rows[0];
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);

    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, r.user_id]);
    await pool.query('UPDATE password_resets SET used=true WHERE id=$1', [r.id]);

    res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

// Verify reset token (check if still valid)
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    const result = await pool.query(
      'SELECT * FROM password_resets WHERE token=$1 AND used=false AND expires_at > NOW()',
      [token]
    );
    res.json({ valid: result.rows.length > 0 });
  } catch (err) {
    res.json({ valid: false });
  }
});

// Accept admin invite
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, username, email, password, phone } = req.body;
    if (!token) return res.status(400).json({ error: 'Invalid invite token' });

    const invite = await pool.query(
      'SELECT * FROM admin_invites WHERE token=$1 AND used=false AND expires_at > NOW()',
      [token]
    );
    if (!invite.rows.length) return res.status(400).json({ error: 'Invite link is invalid or has expired.' });
    const inv = invite.rows[0];

    // Check if user with this email already exists — upgrade them to admin
    const existing = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [inv.email]);
    let user;
    if (existing.rows.length) {
      const updated = await pool.query(
        'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, username, email, role',
        ['admin', existing.rows[0].id]
      );
      user = updated.rows[0];
    } else {
      if (!username || !password) return res.status(400).json({ error: 'Username and password required to create account' });
      user = await register(username.trim(), inv.email, password, phone || '');
      await pool.query('UPDATE users SET role=$1 WHERE id=$2', ['admin', user.id]);
      user.role = 'admin';
    }

    await pool.query('UPDATE admin_invites SET used=true WHERE id=$1', [inv.id]);

    const jwtToken = signToken(user);
    res.cookie('token', jwtToken, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, role: 'admin' } });
  } catch (err) {
    console.error('Accept invite error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
