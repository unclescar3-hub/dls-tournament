/**
 * Game Day Royal Tournaments — Automated Scheduler
 * Runs every 5 minutes and fires reminder emails/notifications
 * automatically at the 24-hour and 1-hour marks before each fixture.
 */

const pool = require('./db');
const { sendEmail } = require('./email');
const { createNotification } = require('./notifHelper');

const APP_URL = () => process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

function baseEmail(content) {
  return `<div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;border-radius:12px">
    <div style="text-align:center;margin-bottom:28px">
      <h1 style="color:#00e676;font-size:22px;letter-spacing:3px;margin:0">GAME DAY <span style="color:#f0f4ff">ROYAL</span></h1>
      <p style="color:#6b7a99;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Nigeria's Premier Esports Tournament</p>
    </div>
    ${content}
    <hr style="border:1px solid #1e2d45;margin:32px 0">
    <p style="color:#6b7a99;font-size:11px;text-align:center">&copy; 2026 Game Day Royal Tournaments &bull; <a href="${APP_URL()}" style="color:#3b82f6">${APP_URL()}</a></p>
  </div>`;
}

function reminderHtml(pname, oname, tname, matchDate, timeLabel, matchCode, note) {
  const accentColor = timeLabel === '1 hour' ? '#ff1a5e' : '#ffc107';
  return baseEmail(`
    <h2 style="color:${accentColor}">⏰ Match Reminder — ${timeLabel} to go!</h2>
    <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${pname}</strong>, your match is coming up <strong style="color:${accentColor}">${timeLabel === '1 hour' ? 'in just 1 hour' : 'tomorrow'}</strong>!</p>
    <div style="background:#0f1623;border:2px solid ${accentColor}40;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
      <div style="font-size:.72rem;color:#6b7a99;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">${tname}</div>
      <div style="font-size:1.4rem;font-weight:700;margin-bottom:16px">${pname} <span style="color:#6b7a99;font-size:1rem">vs</span> ${oname}</div>
      <div style="color:#6b7a99;font-size:.8rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Match Time</div>
      <div style="font-size:1.15rem;font-weight:700;color:${accentColor}">${matchDate}</div>
      ${matchCode ? `
      <div style="margin-top:20px;background:${accentColor}15;border:1px solid ${accentColor}40;border-radius:8px;padding:14px;display:inline-block;min-width:200px">
        <div style="font-size:.7rem;color:#6b7a99;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Lobby Code</div>
        <div style="font-family:monospace;font-size:2rem;font-weight:700;letter-spacing:5px;color:${accentColor}">${matchCode}</div>
      </div>` : ''}
    </div>
    ${note ? `<div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:12px;margin-bottom:14px"><div style="color:#ffc107;font-size:.7rem;font-weight:700;margin-bottom:4px">ADMIN NOTE</div><p style="color:#6b7a99;margin:0;font-size:.82rem">${note}</p></div>` : ''}
    <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:14px">
      <p style="color:#6b7a99;margin:0;font-size:.8rem;line-height:1.8">
        ▶ The winner must submit a screenshot within <strong style="color:#f0f4ff">1 hour</strong> of the match via their dashboard.<br>
        ▶ Disputes must be raised within <strong style="color:#f0f4ff">12 hours</strong>.
      </p>
    </div>
    <div style="text-align:center;margin-top:24px">
      <a href="${APP_URL()}/fixtures.html" style="background:${accentColor};color:${timeLabel==='1 hour'?'#fff':'#000'};padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1px">View Fixtures</a>
    </div>`);
}

async function checkAndSendReminders() {
  try {
    const now = new Date();

    // ── 24-hour reminders ────────────────────────────────────────────────────
    // Fixtures starting between 23h and 25h from now, 24h reminder not sent yet
    const in24h = await pool.query(`
      SELECT f.*,
        u1.username as p1name, u1.email as p1email,
        u2.username as p2name, u2.email as p2email,
        t.name as tname, t.arena
      FROM fixtures f
      JOIN users u1 ON u1.id = f.player1_id
      JOIN users u2 ON u2.id = f.player2_id
      JOIN tournaments t ON t.id = f.tournament_id
      WHERE f.status = 'scheduled'
        AND f.reminder_sent = false
        AND f.scheduled_at BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
    `);

    for (const f of in24h.rows) {
      const matchDate = new Date(f.scheduled_at).toLocaleString('en-NG', {
        dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos'
      });

      console.log(`[Scheduler] 24h reminder → ${f.p1name} vs ${f.p2name} at ${matchDate}`);

      // In-app notifications
      await Promise.all([
        createNotification(f.player1_id, 'reminder',
          `⏰ Match Tomorrow: ${f.tname}`,
          `You play vs ${f.p2name} tomorrow at ${matchDate}`,
          '/fixtures.html'),
        createNotification(f.player2_id, 'reminder',
          `⏰ Match Tomorrow: ${f.tname}`,
          `You play vs ${f.p1name} tomorrow at ${matchDate}`,
          '/fixtures.html')
      ]);

      // Emails
      if (process.env.GMAIL_APP_PASSWORD) {
        await Promise.all([
          sendEmail({
            to: f.p1email,
            subject: `⏰ Match Reminder (Tomorrow): vs ${f.p2name} — ${f.tname}`,
            html: reminderHtml(f.p1name, f.p2name, f.tname, matchDate, '24 hours', f.match_code, f.note)
          }),
          sendEmail({
            to: f.p2email,
            subject: `⏰ Match Reminder (Tomorrow): vs ${f.p1name} — ${f.tname}`,
            html: reminderHtml(f.p2name, f.p1name, f.tname, matchDate, '24 hours', f.match_code, f.note)
          })
        ]).catch(e => console.warn('[Scheduler] 24h email failed:', e.message));
      }

      // Mark sent
      await pool.query('UPDATE fixtures SET reminder_sent = true WHERE id = $1', [f.id]);
    }

    // ── 1-hour reminders ─────────────────────────────────────────────────────
    // Fixtures starting between 50min and 70min from now, 1h reminder not sent
    const in1h = await pool.query(`
      SELECT f.*,
        u1.username as p1name, u1.email as p1email,
        u2.username as p2name, u2.email as p2email,
        t.name as tname, t.arena
      FROM fixtures f
      JOIN users u1 ON u1.id = f.player1_id
      JOIN users u2 ON u2.id = f.player2_id
      JOIN tournaments t ON t.id = f.tournament_id
      WHERE f.status = 'scheduled'
        AND f.reminder_1h_sent = false
        AND f.scheduled_at BETWEEN NOW() + INTERVAL '50 minutes' AND NOW() + INTERVAL '70 minutes'
    `);

    for (const f of in1h.rows) {
      const matchDate = new Date(f.scheduled_at).toLocaleString('en-NG', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos'
      });

      console.log(`[Scheduler] 1h reminder → ${f.p1name} vs ${f.p2name} at ${matchDate}`);

      // In-app notifications (urgent)
      await Promise.all([
        createNotification(f.player1_id, 'reminder',
          `🔴 Match in 1 Hour: ${f.tname}`,
          `Get ready! You vs ${f.p2name} starts at ${matchDate}${f.match_code ? '. Code: ' + f.match_code : ''}`,
          '/fixtures.html'),
        createNotification(f.player2_id, 'reminder',
          `🔴 Match in 1 Hour: ${f.tname}`,
          `Get ready! You vs ${f.p1name} starts at ${matchDate}${f.match_code ? '. Code: ' + f.match_code : ''}`,
          '/fixtures.html')
      ]);

      // Emails
      if (process.env.GMAIL_APP_PASSWORD) {
        await Promise.all([
          sendEmail({
            to: f.p1email,
            subject: `🔴 1 Hour Until Your Match: vs ${f.p2name} — ${f.tname}`,
            html: reminderHtml(f.p1name, f.p2name, f.tname, matchDate, '1 hour', f.match_code, f.note)
          }),
          sendEmail({
            to: f.p2email,
            subject: `🔴 1 Hour Until Your Match: vs ${f.p1name} — ${f.tname}`,
            html: reminderHtml(f.p2name, f.p1name, f.tname, matchDate, '1 hour', f.match_code, f.note)
          })
        ]).catch(e => console.warn('[Scheduler] 1h email failed:', e.message));
      }

      // Mark sent
      await pool.query('UPDATE fixtures SET reminder_1h_sent = true WHERE id = $1', [f.id]);
    }

    // ── Auto-mark overdue fixtures ────────────────────────────────────────────
    // Fixtures that passed more than 3 hours ago and are still 'scheduled' → mark played
    await pool.query(`
      UPDATE fixtures SET status = 'played'
      WHERE status = 'scheduled'
        AND scheduled_at < NOW() - INTERVAL '3 hours'
    `);

    const total = in24h.rows.length + in1h.rows.length;
    if (total > 0) {
      console.log(`[Scheduler] Sent ${in24h.rows.length} × 24h and ${in1h.rows.length} × 1h reminders`);
    }
  } catch (err) {
    console.error('[Scheduler] Error during reminder check:', err.message);
  }
}

function startScheduler() {
  console.log('[Scheduler] Started — checking every 5 minutes for fixture reminders');
  // Run immediately on start to catch anything missed during downtime
  setTimeout(checkAndSendReminders, 10000); // 10s after boot to let DB settle
  // Then run on interval
  setInterval(checkAndSendReminders, INTERVAL_MS);
}

module.exports = { startScheduler };
