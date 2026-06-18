const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'gameday-fallback-secret';

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = verifyToken(token);
    // Update online presence (non-blocking — never fails the request)
    pool.query('UPDATE users SET last_active=NOW() WHERE id=$1', [req.user.id]).catch(() => {});
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = verifyToken(token);
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function register(username, email, password, phone) {
  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (username, email, password_hash, phone) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
    [username, email, hash, phone]
  );
  return result.rows[0];
}

async function login(emailOrUsername, password) {
  // Support login by email OR username
  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1)',
    [emailOrUsername]
  );
  if (!result.rows.length) throw new Error('No account found with that email or username');
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Incorrect password. Try again or reset your password.');
  return user;
}

module.exports = { signToken, verifyToken, authMiddleware, adminMiddleware, register, login };
