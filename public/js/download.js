'use strict';

let currentToken = null;

const accessCard   = document.getElementById('accessCard');
const filesCard    = document.getElementById('filesCard');
const alertEl      = document.getElementById('alert');
const accessBtn    = document.getElementById('accessBtn');
const codenameEl   = document.getElementById('codename');
const passwordEl   = document.getElementById('password');

function showError(msg) {
  alertEl.textContent = msg;
  alertEl.className = 'alert alert-error show';
}

function formatBytes(b) {
  if (b < 1024)       return b + ' B';
  if (b < 1048576)    return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function doAccess() {
  const codename = codenameEl.value.trim();
  const password = passwordEl.value;
  if (!codename || !password) { showError('Please enter a codename and password.'); return; }

  accessBtn.disabled = true;
  accessBtn.textContent = 'Checking…';

  try {
    const res  = await fetch('/api/download/grant', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ codename, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Access denied.');
      accessBtn.disabled = false;
      accessBtn.textContent = 'Access';
      passwordEl.value = '';
      return;
    }

    currentToken = data.token;
    renderFiles(codename, data.files);

  } catch (_) {
    showError('Network error. Please try again.');
    accessBtn.disabled = false;
    accessBtn.textContent = 'Access';
  }
}

function renderFiles(codename, files) {
  accessCard.style.display = 'none';
  filesCard.style.display  = 'block';

  document.getElementById('groupTitle').textContent    = codename;
  document.getElementById('groupSubtitle').textContent =
    `${files.length} file${files.length !== 1 ? 's' : ''} available`;

  const list = document.getElementById('fileList');
  list.innerHTML = '';

  if (files.length === 0) {
    list.innerHTML = '<li><span class="text-muted">No files in this group.</span></li>';
    return;
  }

  files.forEach(file => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div class="fname">${escHtml(file.originalName)}</div>
        <div class="fsize">${formatBytes(file.size)}</div>
      </div>
      <a class="btn btn-ghost"
         href="/api/download/file/${file.id}?token=${encodeURIComponent(currentToken)}"
         download="${escHtml(file.originalName)}">
        Download
      </a>
    `;
    list.appendChild(li);
  });
}

function resetDownloadPage() {
  currentToken = null;
  accessCard.style.display = 'block';
  filesCard.style.display  = 'none';
  codenameEl.value = '';
  passwordEl.value = '';
  alertEl.className = 'alert alert-error';
  accessBtn.disabled = false;
  accessBtn.textContent = 'Access';
  codenameEl.focus();
}

// ── Event listeners ───────────────────────────────────────────────────────────
accessBtn.addEventListener('click', doAccess);
[codenameEl, passwordEl].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') doAccess(); })
);

// Navigation buttons — wired here, not as inline onclick, to respect CSP
document.getElementById('gotoLoginBtn').addEventListener('click', () => {
  location.href = '/login.html';
});
document.getElementById('resetBtn').addEventListener('click', resetDownloadPage);
