const nodemailer = require('nodemailer');

const PLATFORM_EMAIL = process.env.GMAIL_USER || 'gamedayroyaltournaments@gmail.com';
const PLATFORM_NAME = 'Game Day Royal Tournaments';
const APP_URL = () => process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: PLATFORM_EMAIL, pass: process.env.GMAIL_APP_PASSWORD }
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
    to, subject, html, text: text || subject
  });
}

function baseWrapper(content) {
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

async function sendWelcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: `Welcome to Game Day Royal Tournaments, ${user.username}!`,
    html: baseWrapper(`
      <h2>Welcome, ${user.username}!</h2>
      <p style="color:#6b7a99;line-height:1.7">Your account is active. Compete across all three arenas:</p>
      <div style="display:flex;gap:10px;margin:20px 0;flex-wrap:wrap">
        <div style="background:#0f1623;border:1px solid #1e2d45;border-top:3px solid #00e676;border-radius:8px;padding:14px;flex:1;min-width:130px"><div style="color:#00e676;font-weight:700">DLS Arena</div><div style="color:#6b7a99;font-size:12px">From ₦100/entry</div></div>
        <div style="background:#0f1623;border:1px solid #1e2d45;border-top:3px solid #00e5ff;border-radius:8px;padding:14px;flex:1;min-width:130px"><div style="color:#00e5ff;font-weight:700">eFootball</div><div style="color:#6b7a99;font-size:12px">From ₦200/entry</div></div>
        <div style="background:#0f1623;border:1px solid #1e2d45;border-top:3px solid #ff1a5e;border-radius:8px;padding:14px;flex:1;min-width:130px"><div style="color:#ff1a5e;font-weight:700">EA FC</div><div style="color:#6b7a99;font-size:12px">From ₦150/entry</div></div>
      </div>
      <p style="color:#6b7a99;font-size:13px;margin-bottom:24px">Add your bank account on your dashboard so you can receive prize payouts directly — no delays, no middleman.</p>
      <div style="text-align:center">
        <a href="${APP_URL()}/dashboard.html" style="background:#00e676;color:#000;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px">Go to Dashboard</a>
      </div>`)
  });
}

async function sendPasswordResetEmail(user, resetToken) {
  const resetUrl = `${APP_URL()}/reset-password.html?token=${resetToken}`;
  return sendEmail({
    to: user.email,
    subject: 'Reset Your Game Day Royal Tournaments Password',
    html: baseWrapper(`
      <h2>Password Reset Request</h2>
      <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${user.username}</strong>, click below within <strong style="color:#ffc107">30 minutes</strong>:</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="background:#3b82f6;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px">Reset My Password</a>
      </div>
      <p style="color:#6b7a99;font-size:12px">Or copy: <span style="color:#3b82f6;word-break:break-all">${resetUrl}</span></p>
      <div style="background:#0f1623;border:1px solid #ff444430;border-radius:8px;padding:12px;margin-top:16px">
        <p style="color:#ff4444;margin:0;font-size:12px">⚠ If you didn't request this, ignore this email. Your password won't change.</p>
      </div>`)
  });
}

async function sendMatchCodeEmail(player, opponent, code, tournamentName, note) {
  return sendEmail({
    to: player.email,
    subject: `🎮 Your Match Code — ${tournamentName} | Game Day Royal`,
    html: baseWrapper(`
      <h2>Your Match is Set!</h2>
      <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${player.username}</strong>, your match has been scheduled in <strong style="color:#00e676">${tournamentName}</strong>.</p>
      <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
        <div style="color:#6b7a99;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Your Opponent</div>
        <div style="font-size:22px;font-weight:700;margin-bottom:18px">${opponent.username}</div>
        <div style="color:#6b7a99;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">Lobby Code</div>
        <div style="background:#00e67620;border:2px solid #00e676;border-radius:8px;padding:18px;display:inline-block;min-width:200px">
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#00e676;font-family:monospace">${code}</div>
        </div>
        <p style="color:#6b7a99;font-size:11px;margin-top:10px">Enter this code in-game to join the lobby</p>
      </div>
      ${note ? `<div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:12px;margin-bottom:14px"><div style="color:#ffc107;font-size:11px;font-weight:700;margin-bottom:4px">ADMIN NOTE</div><p style="color:#6b7a99;margin:0;font-size:12px">${note}</p></div>` : ''}
      <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:14px">
        <p style="color:#6b7a99;margin:0;font-size:12px;line-height:1.7">▶ The <strong style="color:#f0f4ff">winner</strong> must submit a screenshot via their dashboard within 1 hour.<br>▶ Disputes must be raised within 12 hours. Read the <a href="${APP_URL()}/rules.html" style="color:#3b82f6">rulebook</a>.</p>
      </div>`)
  });
}

async function sendAdminInviteEmail(recipientEmail, inviterName, inviteToken, title) {
  const inviteUrl = `${APP_URL()}/accept-invite.html?token=${inviteToken}`;
  return sendEmail({
    to: recipientEmail,
    subject: "You've been invited to join the Game Day Royal admin team",
    html: baseWrapper(`
      <h2>Admin Team Invitation</h2>
      <p style="color:#6b7a99;line-height:1.7"><strong style="color:#f0f4ff">${inviterName}</strong> has invited you to join the <strong style="color:#00e676">Game Day Royal Tournaments</strong> admin team${title ? ` as <strong style="color:#ffc107">${title}</strong>` : ''}. You'll be able to manage tournaments, review matches, and run the platform.</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${inviteUrl}" style="background:#ff1a5e;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px">Accept Invitation</a>
      </div>
      <p style="color:#6b7a99;font-size:12px">This invite expires in <strong>48 hours</strong>. If you don't have an account yet, you'll be prompted to create one.</p>`)
  });
}

async function sendAdminRegistrationNotification(user, tournament) {
  return sendEmail({
    to: PLATFORM_EMAIL,
    subject: `New Registration: ${user.username} → ${tournament.name}`,
    html: baseWrapper(`
      <h2 style="color:#00e676">New Tournament Registration</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:14px">
        <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Player</td><td style="color:#f0f4ff;font-weight:700">${user.username} (${user.email})</td></tr>
        <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Tournament</td><td style="color:#f0f4ff">${tournament.name}</td></tr>
        <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Arena</td><td style="color:#f0f4ff">${tournament.arena}</td></tr>
        <tr><td style="color:#6b7a99;padding:8px 0">Entry Fee</td><td style="color:#00e676;font-weight:700">₦${Number(tournament.entry_fee).toLocaleString()} — PAID</td></tr>
      </table>`)
  });
}

async function sendAdminMatchNotification(submitter, opponent, tournament, result) {
  return sendEmail({
    to: PLATFORM_EMAIL,
    subject: `Match Result Pending Review: ${submitter.username} vs ${opponent.username}`,
    html: baseWrapper(`
      <h2 style="color:#ffc107">Match Result Needs Review</h2>
      <p style="color:#6b7a99">A match result has been submitted and requires your review.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:14px">
        <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Tournament</td><td style="color:#f0f4ff">${tournament}</td></tr>
        <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Submitter</td><td style="color:#f0f4ff;font-weight:700">${submitter.username}</td></tr>
        <tr><td style="color:#6b7a99;padding:8px 0;border-bottom:1px solid #1e2d45">Opponent</td><td style="color:#f0f4ff">${opponent.username}</td></tr>
        <tr><td style="color:#6b7a99;padding:8px 0">Score</td><td style="color:#f0f4ff;font-size:18px;font-weight:700">${result.submitter_score} – ${result.opponent_score}</td></tr>
      </table>`)
  });
}

async function sendPayoutEmail(user, tournamentName, amount, position, accountName, bankName) {
  const ordinal = n => n + (['th','st','nd','rd'][((n%100-20)%10)||n%100>10?0:n%10] || 'th');
  return sendEmail({
    to: user.email,
    subject: `💰 Prize Payout Sent — ${tournamentName} | Game Day Royal`,
    html: baseWrapper(`
      <h2 style="color:#00e676">Prize Payout Sent! 🏆</h2>
      <p style="color:#6b7a99;line-height:1.7">Congratulations <strong style="color:#f0f4ff">${user.username}</strong>! Your prize for finishing <strong style="color:#ffc107">${ordinal(position)} place</strong> in <strong style="color:#00e676">${tournamentName}</strong> has been sent.</p>
      <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
        <div style="color:#6b7a99;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Amount Transferred</div>
        <div style="font-family:monospace;font-size:36px;font-weight:700;color:#00e676">₦${Number(amount).toLocaleString()}</div>
        <div style="margin-top:14px;color:#6b7a99;font-size:13px">To: <strong style="color:#f0f4ff">${accountName}</strong><br><span style="font-size:12px">${bankName}</span></div>
      </div>
      <div style="background:#0f1623;border:1px solid #1e2d4560;border-radius:8px;padding:14px">
        <p style="color:#6b7a99;margin:0;font-size:12px;line-height:1.7">Funds typically arrive within minutes via Paystack. If you don't receive within 24 hours, reply to this email.<br><br>Keep competing — check open tournaments now!</p>
      </div>
      <div style="text-align:center;margin-top:20px">
        <a href="${APP_URL()}" style="background:#00e676;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1px">Browse Tournaments</a>
      </div>`)
  });
}

async function sendProvingGroundMatchEmail(player, opponent, gameCode) {
  return sendEmail({
    to: player.email,
    subject: `🎮 Proving Ground Match Found! vs ${opponent.username} | Game Day Royal`,
    html: baseWrapper(`
      <h2 style="color:#00e5ff">Proving Ground — Match Found! ⚡</h2>
      <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${player.username}</strong>, you've been matched in the Proving Ground!</p>
      <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
        <div style="color:#6b7a99;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Your Opponent</div>
        <div style="font-size:22px;font-weight:700;margin-bottom:18px">${opponent.username}</div>
        <div style="color:#6b7a99;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">Game Code</div>
        <div style="background:#00e5ff20;border:2px solid #00e5ff;border-radius:8px;padding:18px;display:inline-block;min-width:200px">
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#00e5ff;font-family:monospace">${gameCode}</div>
        </div>
        <p style="color:#6b7a99;font-size:11px;margin-top:10px">Enter this code in DLS to start the match</p>
      </div>
      <div style="background:#0f1623;border:1px solid #1e2d45;border-radius:8px;padding:14px">
        <p style="color:#6b7a99;margin:0;font-size:12px;line-height:1.7">▶ After the match, upload your screenshot via your dashboard.<br>▶ The Proving Ground is a fast-match arena — good luck!</p>
      </div>`)
  });
}

async function sendReferralRewardEmail(user, type, amount) {
  return sendEmail({
    to: user.email,
    subject: `🎉 Referral Reward Earned — ${type === 'cash' ? '₦' + Number(amount).toLocaleString() : amount + ' points'} | Game Day Royal`,
    html: baseWrapper(`
      <h2 style="color:#ffc107">Referral Reward! 🎉</h2>
      <p style="color:#6b7a99;line-height:1.7">Hi <strong style="color:#f0f4ff">${user.username}</strong>, someone you referred just ${type === 'cash' ? 'paid for a tournament' : 'registered'}!</p>
      <div style="background:#0f1623;border:1px solid #ffc10740;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
        <div style="color:#6b7a99;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Your Reward</div>
        ${type === 'cash'
          ? `<div style="font-family:monospace;font-size:36px;font-weight:700;color:#ffc107">₦${Number(amount).toLocaleString()}</div><div style="color:#6b7a99;font-size:12px;margin-top:8px">Cash reward added to your referral earnings</div>`
          : `<div style="font-family:monospace;font-size:36px;font-weight:700;color:#00e676">+${amount} pts</div><div style="color:#6b7a99;font-size:12px;margin-top:8px">Points added to your referral balance</div>`
        }
      </div>
      <div style="text-align:center">
        <a href="${APP_URL()}/dashboard.html" style="background:#ffc107;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1px">View Dashboard</a>
      </div>`)
  });
}

module.exports = {
  sendEmail, sendWelcomeEmail, sendPasswordResetEmail, sendMatchCodeEmail,
  sendAdminInviteEmail, sendAdminRegistrationNotification,
  sendAdminMatchNotification, sendPayoutEmail,
  sendProvingGroundMatchEmail, sendReferralRewardEmail
};
