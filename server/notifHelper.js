const pool = require('./db');

async function createNotification(userId, type, title, body, link = null) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
      [userId, type, title, body, link]
    );
  } catch (err) {
    console.warn('Notification creation failed:', err.message);
  }
}

async function createNotificationForMany(userIds, type, title, body, link = null) {
  for (const uid of userIds) {
    await createNotification(uid, type, title, body, link);
  }
}

module.exports = { createNotification, createNotificationForMany };
