require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./server/db');

const app = express();
const PORT = 5000;

if (!fs.existsSync('public/uploads')) fs.mkdirSync('public/uploads', { recursive: true });

// ── Generate secret admin path ──────────────────────────────────────────────
// Path is derived from the ADMIN_PASSWORD — same every restart, impossible to
// guess without knowing the password. Optionally override via ADMIN_PANEL_PATH.
function getAdminPath() {
  if (process.env.ADMIN_PANEL_PATH) return process.env.ADMIN_PANEL_PATH;
  const seed = (process.env.ADMIN_PASSWORD || 'unclescar_default') + '_esc_ops';
  return '/ops-' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 14);
}
const ADMIN_PATH = getAdminPath();

// ── Rate limiters ────────────────────────────────────────────────────────────

// Strict: admin login — 5 attempts per 15 minutes per IP
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. You are locked out for 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate: all admin API routes — 200 requests per minute per IP
const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General: public API routes
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(generalLimiter);

// ── Block any public access to /admin.html or /admin ─────────────────────────
// Intercept BEFORE static middleware so the file is never served directly
app.get(['/admin.html', '/admin', '/admin/'], (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Static files (public site) ───────────────────────────────────────────────
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/tournaments', require('./server/routes/tournaments'));
app.use('/api/matches', require('./server/routes/matches'));
app.use('/api/streams', require('./server/routes/streams'));
app.use('/api/admin/login', adminLoginLimiter); // apply strict limiter only to login
app.use('/api/admin', adminApiLimiter, require('./server/routes/admin'));
app.use('/api/payouts', require('./server/routes/payouts'));
app.use('/api/fixtures', require('./server/routes/fixtures'));
app.use('/api/notifications', require('./server/routes/notifications'));
app.use('/api/announcements', require('./server/routes/announcements'));
app.use('/api/ads', require('./server/routes/ads'));
app.use('/api/telegram', require('./server/routes/telegram'));

// ── Admin session middleware ──────────────────────────────────────────────────
function requireAdminSession(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect(ADMIN_PATH);
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.redirect(ADMIN_PATH);
    next();
  } catch { res.redirect(ADMIN_PATH); }
}

// ── Secret Admin Portal routes ────────────────────────────────────────────────
// /ops-[hash]           → login page (public)
// /ops-[hash]/dashboard → admin panel (requires valid admin session)
app.get(ADMIN_PATH, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});
app.get(ADMIN_PATH + '/dashboard', requireAdminSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Public HTML pages ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/:page.html', (req, res) => {
  // Never serve admin.html directly even via this catch-all
  if (req.params.page === 'admin') {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  const file = path.join(__dirname, 'public', req.params.page + '.html');
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const schema = fs.readFileSync('./server/schema.sql', 'utf8');
    await pool.query(schema);
    await pool.query(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS title VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP`).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        image_url VARCHAR(500),
        link_url VARCHAR(500),
        type VARCHAR(30) DEFAULT 'banner',
        position VARCHAR(30) DEFAULT 'all',
        active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(120) NOT NULL,
        details JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});

    console.log('Database schema ready');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Game Day Royal Tournaments running on port ${PORT}`);
      const domain = process.env.REPLIT_DEV_DOMAIN || `localhost:${PORT}`;
      const protocol = process.env.REPLIT_DEV_DOMAIN ? 'https' : 'http';
      const fullAdminUrl = `${protocol}://${domain}${ADMIN_PATH}`;
      console.log(`\n  ╔════════════════════════════════════════════════════════════════╗`);
      console.log(`  ║  ADMIN LOGIN PORTAL — KEEP THIS URL PRIVATE                    ║`);
      console.log(`  ║  ${fullAdminUrl.padEnd(62)}║`);
      console.log(`  ╚════════════════════════════════════════════════════════════════╝\n`);

      const { startScheduler } = require('./server/scheduler');
      startScheduler();
    });
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

init();
