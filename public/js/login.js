'use strict';

(async () => {
  // Redirect if already logged in
  try {
    const r = await fetch('/api/auth/me');
    if (r.ok) { location.href = '/dashboard.html'; return; }
  } catch (_) {}

  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const alertEl    = document.getElementById('alert');
  const loginBtn   = document.getElementById('loginBtn');

  function showError(msg) {
    alertEl.textContent = msg;
    alertEl.className = 'alert alert-error show';
  }

  async function doLogin() {
    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (!username || !password) { showError('Please enter your username and password.'); return; }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';

    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok) {
        location.href = '/dashboard.html';
      } else {
        showError(data.error || 'Login failed.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign in';
        passwordEl.value = '';
        passwordEl.focus();
      }
    } catch (_) {
      showError('Network error. Please try again.');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in';
    }
  }

  loginBtn.addEventListener('click', doLogin);
  [usernameEl, passwordEl].forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); })
  );

  // Navigation — wired here to avoid inline onclick being blocked by CSP
  document.getElementById('gotoDownloadBtn').addEventListener('click', () => {
    location.href = '/download.html';
  });
})();
