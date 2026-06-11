const API = '/api';
let currentUser = null;

function toast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  t.innerHTML = `<span style="font-size:1.1rem">${icons[type]||'ℹ'}</span><span>${message}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='0.3s'; setTimeout(()=>t.remove(),300); }, 3500);
}

async function api(method, path, body, isFormData = false) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body && !isFormData) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  else if (body && isFormData) { opts.body = body; }
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadUser() {
  try {
    const data = await api('GET', '/auth/me');
    currentUser = data.user;
    updateNavAuth();
    return data.user;
  } catch {
    currentUser = null;
    updateNavAuth();
    return null;
  }
}

function updateNavAuth() {
  const loginBtn = document.getElementById('nav-login-btn');
  const registerBtn = document.getElementById('nav-register-btn');
  const userMenu = document.getElementById('nav-user-menu');
  const usernameEl = document.getElementById('nav-username');
  const dashLink = document.getElementById('nav-dashboard-link');

  if (currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (userMenu) userMenu.style.display = 'flex';
    if (usernameEl) usernameEl.textContent = currentUser.username;
    if (dashLink && currentUser.role === 'admin') dashLink.href = '/admin.html';
    else if (dashLink) dashLink.href = '/dashboard.html';
    // Inject notification bell
    injectNotificationBell();
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (registerBtn) registerBtn.style.display = '';
    if (userMenu) userMenu.style.display = 'none';
  }
}

function injectNotificationBell() {
  if (document.getElementById('notif-bell')) return;
  const userMenu = document.getElementById('nav-user-menu');
  if (!userMenu) return;
  const bell = document.createElement('a');
  bell.id = 'notif-bell';
  bell.href = '/dashboard.html#notifications';
  bell.title = 'Notifications';
  bell.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--muted);text-decoration:none;font-size:1.05rem;transition:all .2s;flex-shrink:0';
  bell.innerHTML = `🔔<span id="notif-count" style="display:none;position:absolute;top:-5px;right:-5px;background:var(--danger);color:#fff;font-size:.6rem;font-weight:700;border-radius:50%;min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 3px"></span>`;
  userMenu.insertBefore(bell, userMenu.firstChild);
  loadNotifCount();
  setInterval(loadNotifCount, 30000);
}

async function loadNotifCount() {
  try {
    const data = await api('GET', '/notifications/count');
    const badge = document.getElementById('notif-count');
    if (!badge) return;
    if (data.count > 0) { badge.textContent = data.count > 99 ? '99+' : data.count; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
  } catch {}
}

async function logout() {
  try { await api('POST', '/auth/logout'); } catch {}
  currentUser = null;
  updateNavAuth();
  window.location.href = '/';
}

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

function naira(amount) { return '₦' + Number(amount).toLocaleString(); }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }); }
function fmtDateTime(d) { return new Date(d).toLocaleString('en-NG', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Africa/Lagos' }); }

function timeUntil(d) {
  const diff = new Date(d) - Date.now();
  if (diff <= 0) return 'Now / Past';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 48) return Math.floor(h/24) + ' days';
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusBadge(s) {
  const map = { open:'status-open', ongoing:'status-ongoing', closed:'status-closed', completed:'status-completed' };
  return `<span class="status-badge ${map[s]||'tag-muted'}">${s}</span>`;
}

function payWithPaystack(email, amountKobo, ref, onSuccess, onClose) {
  const handler = PaystackPop.setup({
    key: window.PAYSTACK_PUBLIC_KEY,
    email, amount: amountKobo, ref,
    onClose: onClose || (() => toast('Payment cancelled', 'info')),
    callback: onSuccess
  });
  handler.openIframe();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  window.logout = logout;
  window.openModal = openModal;
  window.closeModal = closeModal;
});
