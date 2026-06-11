require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const pool = require('./server/db');

const app = express();
const PORT = 5000;

if (!fs.existsSync('public/uploads')) fs.mkdirSync('public/uploads', { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// Routes
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/tournaments', require('./server/routes/tournaments'));
app.use('/api/matches', require('./server/routes/matches'));
app.use('/api/streams', require('./server/routes/streams'));
app.use('/api/admin', require('./server/routes/admin'));
app.use('/api/payouts', require('./server/routes/payouts'));
app.use('/api/fixtures', require('./server/routes/fixtures'));
app.use('/api/notifications', require('./server/routes/notifications'));
app.use('/api/announcements', require('./server/routes/announcements'));

// Serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/:page.html', (req, res) => {
  const file = path.join(__dirname, 'public', req.params.page + '.html');
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function init() {
  try {
    const schema = fs.readFileSync('./server/schema.sql', 'utf8');
    await pool.query(schema);

    // Add reminder_1h_sent column if it doesn't exist yet (safe migration)
    await pool.query(`
      ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT FALSE
    `).catch(() => {});

    console.log('Database schema ready');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Unclescar Studios running on port ${PORT}`);
      // Start automated fixture reminder scheduler
      const { startScheduler } = require('./server/scheduler');
      startScheduler();
    });
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

init();
