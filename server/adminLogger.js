const pool = require('./db');

const ACTION_LABELS = {
  LOGIN:                 '🔐 Admin logged in',
  LOGOUT:                '🚪 Admin logged out',
  CREATE_TOURNAMENT:     '🏟 Tournament created',
  UPDATE_TOURNAMENT:     '🔄 Tournament status changed',
  DELETE_TOURNAMENT:     '🗑 Tournament deleted',
  APPROVE_MATCH:         '✅ Match result approved',
  REJECT_MATCH:          '❌ Match result rejected',
  SEND_PAYOUT:           '💸 Prize payout sent',
  SEND_ALL_PAYOUTS:      '💸 All payouts triggered',
  GENERATE_CODE:         '🔑 Match code generated',
  SCHEDULE_FIXTURE:      '📅 Fixture scheduled',
  DELETE_FIXTURE:        '🗑 Fixture deleted',
  UPDATE_FIXTURE:        '🔄 Fixture status updated',
  SEND_REMINDER:         '⏰ Manual reminder sent',
  POST_ANNOUNCEMENT:     '📢 Announcement posted',
  DELETE_ANNOUNCEMENT:   '🗑 Announcement deleted',
  RESOLVE_DISPUTE:       '⚖️ Dispute resolved',
  CHANGE_USER_ROLE:      '👤 Player role changed',
  INVITE_ADMIN:          '📧 Co-admin invited',
  BROADCAST_NOTIF:       '🔔 Broadcast notification sent',
};

async function logAction(adminId, action, details = {}, ip = null) {
  try {
    await pool.query(
      'INSERT INTO admin_logs (admin_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [adminId || null, action, JSON.stringify(details), ip || null]
    );
  } catch (e) {
    // Never crash the request if logging fails
    console.warn('[AdminLog] Failed to write log:', e.message);
  }
}

module.exports = { logAction, ACTION_LABELS };
