const crypto = require('crypto');

function getAdminPath() {
  if (process.env.ADMIN_PANEL_PATH) return process.env.ADMIN_PANEL_PATH;
  const seed = (process.env.ADMIN_PASSWORD || 'unclescar_default') + '_esc_ops';
  return '/ops-' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 14);
}

module.exports = { getAdminPath };
