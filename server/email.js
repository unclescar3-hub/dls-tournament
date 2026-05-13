const nodemailer = require('nodemailer');

const PLATFORM_EMAIL = 'unclescarstudio@gmail.com';
const PLATFORM_NAME = 'Unclescar Studios';

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: PLATFORM_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('[Email] GMAIL_APP_PASSWORD not set — email not sent to:', to);
    return { skipped: true };
  }
  const transporter = createTransport();
  return transporter.sendMail({
    from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
    to,
    subject,
    html,
    text: text || subject
  });
}

// Welcome email after registration
async function sendWelcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: `Welcome to Unclescar Studios, ${user.username}!`,
    html: `
      <div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;border-radius:12px">
        <div style="text-align:center;margin-bottom:32px">
          <h1 style="color:#00e676;font-size:28px;letter-spacing:3px;margin:0">UNCLESCAR <span style="color:#f0f4ff">STUDIOS</span></h1>
          <p style="color:#6b7a99;font-size:12px;letter-spacing:2px;text-transform:uppercase">Nigeria's Premier Esports Platform</p>
        </div>
        <h2 style="color:#f0f4ff;margin-bottom:12px">Welcome, ${user.username}!</h2>
        <p style="color:#6b7a99;line-height:1.7">Your account has been created successfully. You can now browse and register for tournaments across all three arenas:</p>
        <div style="display:flex;gap:12px;margin:24px 0;flex-wrap:wrap">
          <div style="background:#0f1623;border:1px solid #1e2d45;border-top:3px solid #00e676;border-radius:8px;padding:16px;flex:1;min-width:140px">
            <div style="color:#00e676;font-weight:700;margin-bottom:4px">DLS Arena</div>
            <div style="color:#6b7a99;font-size:13px">From ₦100/entry</div>
          </div>
          <div style="background:#0f1623;border:1px solid #1e2d45;border-top:3px solid #00e5ff;border-radius:8px;padding:16px;flex:1;min-width:140px">
            <div style="color:#00e5ff;font-weight:700;margin-bottom:4px">eFootball</div>
            <div style="color:#6b7a99;font-size:13px">From ₦200/entry</div>
          </div>
          <div style="background:#0f1623;border:1px solid #1e2d45;border-top:3px solid #ff1a5e;border-radius:8px;padding:16px;flex:1;min-width:140px">
            <div style="color:#ff1a5e;font-weight:700;margin-bottom:4px">EA FC</div>
            <div style="color:#6b7a99;font-size:13px">From ₦150/entry</div>
          </div>
        </div>
        <div style="text-align:center;margin-top:32px">
          <a href="https://unclescar.replit.app" style="background:#00e676;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:14px">Browse Tournaments</a>
        </div>
        <hr style="border:1px solid #1e2d45;margin:32px 0">
        <p style="color:#6b7a99;font-size:12px;text-align:center">Questions? Reply to this email or contact us on WhatsApp. &copy; 2026 Unclescar Studios</p>
      </div>`
  });
}

// Password reset email
async function sendPasswordResetEmail(user, resetToken) {
  const resetUrl = `${process.env.APP_URL || 'https://unclescar.replit.app'}/reset-password.html?token=${resetToken}`;
  return sendEmail({
    to: user.email,
    subject: 'Reset Your Unclescar Studios Password',
    html: `
      <div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;border-radius:12px">
        <div style="text-align:center;margin-bottom:32px">
          <h1 style="color:#00e676;font-size:28px;letter-spacing:3px;margin:0">UNCLESCAR <span style="color:#f0f4ff">STUDIOS</span></h1>
        </div>
        <h2 style="color:#f0f4ff">Password Reset Request</h2>
        <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${user.username}</strong>,<br>We received a request to reset your password. Click the button below within <strong style="color:#ffc107">30 minutes</strong>:</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${resetUrl}" style="background:#3b82f6;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:14px">Reset My Password</a>
        </div>
        <p style="color:#6b7a99;font-size:13px">Or copy this link:<br><span style="color:#3b82f6;word-break:break-all">${resetUrl}</span></p>
        <div style="background:#0f1623;border:1px solid #ff444430;border-radius:8px;padding:14px;margin-top:24px">
          <p style="color:#ff4444;margin:0;font-size:13px">&#9888; If you did not request this, ignore this email. Your password will NOT change.</p>
        </div>
        <hr style="border:1px solid #1e2d45;margin:32px 0">
        <p style="color:#6b7a99;font-size:12px;text-align:center">&copy; 2026 Unclescar Studios</p>
      </div>`
  });
}

// Match code email — sent to both players
async function sendMatchCodeEmail(player, opponent, code, tournamentName, note) {
  return sendEmail({
    to: player.email,
    subject: `Your Match Code — ${tournamentName}`,
    html: `
      <div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;border-radius:12px">
        <div style="text-align:center;margin-bottom:32px">
          <h1 style="color:#00e676;font-size:28px;letter-spacing:3px;margin:0">UNCLESCAR <span style="color:#f0f4ff">STUDIOS</span></h1>
        </div>
        <h2 style="color:#f0f4ff">Your Match Fixture</h2>
        <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${player.username}</strong>, your match has been scheduled in <strong style="color:#00e676">${tournamentName}</strong>.</p>
        <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin:24px 0;text-align:center">
          <div style="color:#6b7a99;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Your Opponent</div>
          <div style="font-size:22px;font-weight:700;color:#f0f4ff;margin-bottom:20px">${opponent.username}</div>
          <div style="color:#6b7a99;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Lobby Code</div>
          <div style="background:#00e67620;border:2px solid #00e676;border-radius:8px;padding:20px;display:inline-block;min-width:200px">
            <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#00e676;font-family:monospace">${code}</div>
          </div>
          <p style="color:#6b7a99;font-size:12px;margin-top:12px">Copy this code and use it to create/join the lobby in-game</p>
        </div>
        ${note ? `<div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:14px;margin-bottom:16px"><div style="color:#ffc107;font-size:12px;font-weight:600;margin-bottom:4px">ADMIN NOTE</div><p style="color:#6b7a99;margin:0;font-size:13px">${note}</p></div>` : ''}
        <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:16px">
          <p style="color:#6b7a99;margin:0;font-size:13px;line-height:1.6">&#9654; After your match, the <strong style="color:#f0f4ff">winner</strong> must submit a screenshot via their dashboard within 1 hour.<br>&#9654; Any disputes must be raised within 12 hours. Read the <a href="https://unclescar.replit.app/rules.html" style="color:#3b82f6">rulebook</a>.</p>
        </div>
        <hr style="border:1px solid #1e2d45;margin:32px 0">
        <p style="color:#6b7a99;font-size:12px;text-align:center">&copy; 2026 Unclescar Studios &bull; <a href="https://unclescar.replit.app" style="color:#3b82f6">unclescar.replit.app</a></p>
      </div>`
  });
}

// Admin invite email
async function sendAdminInviteEmail(recipientEmail, inviterName, inviteToken) {
  const inviteUrl = `${process.env.APP_URL || 'https://unclescar.replit.app'}/accept-invite.html?token=${inviteToken}`;
  return sendEmail({
    to: recipientEmail,
    subject: 'You\'ve been invited to co-admin Unclescar Studios',
    html: `
      <div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;border-radius:12px">
        <div style="text-align:center;margin-bottom:32px">
          <h1 style="color:#00e676;font-size:28px;letter-spacing:3px;margin:0">UNCLESCAR <span style="color:#f0f4ff">STUDIOS</span></h1>
        </div>
        <h2>Admin Invitation</h2>
        <p style="color:#6b7a99;line-height:1.7"><strong style="color:#f0f4ff">${inviterName}</strong> has invited you to become a co-admin of <strong style="color:#00e676">Unclescar Studios</strong>. As a co-admin, you'll be able to manage tournaments, review match results, and help run the platform.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${inviteUrl}" style="background:#ff1a5e;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:14px">Accept Invitation</a>
        </div>
        <p style="color:#6b7a99;font-size:13px">This invite expires in <strong>24 hours</strong>. If you don't have an account yet, you'll be prompted to create one.</p>
        <hr style="border:1px solid #1e2d45;margin:32px 0">
        <p style="color:#6b7a99;font-size:12px;text-align:center">&copy; 2026 Unclescar Studios</p>
      </div>`
  });
}

// Notify admin of new registration
async function sendAdminRegistrationNotification(user, tournament) {
  return sendEmail({
    to: PLATFORM_EMAIL,
    subject: `New Registration: ${user.username} → ${tournament.name}`,
    html: `
      <div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:32px;max-width:520px;margin:0 auto;border-radius:12px">
        <h2 style="color:#00e676">New Tournament Registration</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Player</td><td style="color:#f0f4ff;font-weight:700">${user.username} (${user.email})</td></tr>
          <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Tournament</td><td style="color:#f0f4ff">${tournament.name}</td></tr>
          <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Arena</td><td style="color:#f0f4ff">${tournament.arena}</td></tr>
          <tr><td style="color:#6b7a99;padding:8px 0">Entry Fee</td><td style="color:#00e676;font-weight:700">₦${Number(tournament.entry_fee).toLocaleString()} — PAID</td></tr>
        </table>
        <div style="margin-top:24px;text-align:center">
          <a href="https://unclescar.replit.app/admin.html" style="background:#3b82f6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Open Admin Panel</a>
        </div>
      </div>`
  });
}

// Notify admin of new match result submission
async function sendAdminMatchNotification(submitter, opponent, tournament, result) {
  return sendEmail({
    to: PLATFORM_EMAIL,
    subject: `Match Result Pending Review: ${submitter.username} vs ${opponent.username}`,
    html: `
      <div style="background:#080c14;color:#f0f4ff;font-family:Arial,sans-serif;padding:32px;max-width:520px;margin:0 auto;border-radius:12px">
        <h2 style="color:#ffc107">Match Result Needs Review</h2>
        <p style="color:#6b7a99">A match result has been submitted and requires admin review.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Tournament</td><td style="color:#f0f4ff">${tournament}</td></tr>
          <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Submitter</td><td style="color:#f0f4ff;font-weight:700">${submitter.username}</td></tr>
          <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Opponent</td><td style="color:#f0f4ff">${opponent.username}</td></tr>
          <tr><td style="color:#6b7a99;padding:8px 0">Claimed Score</td><td style="color:#f0f4ff;font-size:18px;font-weight:700">${result.submitter_score} – ${result.opponent_score}</td></tr>
        </table>
        <div style="margin-top:24px;text-align:center">
          <a href="https://unclescar.replit.app/admin.html" style="background:#ff1a5e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Review Now</a>
        </div>
      </div>`
  });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendMatchCodeEmail,
  sendAdminInviteEmail,
  sendAdminRegistrationNotification,
  sendAdminMatchNotification
};
