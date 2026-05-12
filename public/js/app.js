// Global app utilities
const API = '/api';
let currentUser = null;

// Toast notifications
function toast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  t.innerHTML = `<span style="font-size:1.1rem">${icons[type]||'ℹ'}</span><span>${message}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// API helper
async function api(method, path, body, isFormData = false) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body && !isFormData) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  else if (body && isFormData) { opts.body = body; }
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Auth state
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
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (registerBtn) registerBtn.style.display = '';
    if (userMenu) userMenu.style.display = 'none';
  }
}

async function logout() {
  try { await api('POST', '/auth/logout'); } catch {}
  currentUser = null;
  updateNavAuth();
  window.location.href = '/';
}

// Modal helpers
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// Format currency
function naira(amount) { return '₦' + Number(amount).toLocaleString(); }

// Format date
function fmtDate(d) { return new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }); }

// Status badge HTML
function statusBadge(s) {
  const map = { open:'status-open', ongoing:'status-ongoing', closed:'status-closed', completed:'status-completed' };
  return `<span class="status-badge ${map[s]||'tag-muted'}">${s}</span>`;
}

// Paystack inline
function payWithPaystack(email, amountKobo, ref, onSuccess, onClose) {
  const handler = PaystackPop.setup({
    key: window.PAYSTACK_PUBLIC_KEY,
    email, amount: amountKobo, ref,
    onClose: onClose || (() => toast('Payment cancelled', 'info')),
    callback: onSuccess
  });
  handler.openIframe();
}

// Init on load
document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  // Expose for inline handlers
  window.logout = logout;
  window.openModal = openModal;
  window.closeModal = closeModal;
});
