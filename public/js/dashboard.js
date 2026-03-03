'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let myFiles  = [];
let myGroups = [];
let editingGroupId = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(b) {
  if (b < 1024)       return b + ' B';
  if (b < 1048576)    return (b/1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
  return (b/1073741824).toFixed(2) + ' GB';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' });
}

function isExpired(group) {
  if (group.expiresAt && new Date() > new Date(group.expiresAt)) return true;
  if (group.downloadLimit !== null && group.downloadCount >= group.downloadLimit) return true;
  return false;
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.className = `alert alert-${type}`, 4000);
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res  = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const me = await api('GET', '/auth/me');
    document.getElementById('topbarUser').textContent = me.username;
  } catch (_) {
    location.href = '/login.html';
    return;
  }
  await loadFiles();
  await loadGroups();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});

// ── Panel switching ───────────────────────────────────────────────────────────
document.querySelectorAll('.sidebar-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const panel = btn.dataset.panel;
    document.getElementById('panel-files').style.display  = panel === 'files'  ? '' : 'none';
    document.getElementById('panel-groups').style.display = panel === 'groups' ? '' : 'none';
  });
});

// ── Files panel ───────────────────────────────────────────────────────────────
async function loadFiles() {
  myFiles = await api('GET', '/files');
  renderFiles();
}

function renderFiles() {
  const table = document.getElementById('filesTable');
  const empty = document.getElementById('filesEmpty');
  const tbody = document.getElementById('filesBody');

  tbody.innerHTML = '';

  if (myFiles.length === 0) {
    table.style.display = 'none';
    empty.style.display = '';
    return;
  }

  table.style.display = '';
  empty.style.display = 'none';

  myFiles.forEach(f => {
    const groupsUsingFile = myGroups.filter(g => g.fileIds.includes(f.id)).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(f.originalName)}</td>
      <td>${formatBytes(f.size)}</td>
      <td>${formatDate(f.uploadedAt)}</td>
      <td><span class="badge badge-neutral">${groupsUsingFile}</span></td>
      <td class="actions">
        <button class="btn btn-danger" data-delete-file="${f.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Upload area
document.getElementById('uploadTrigger').addEventListener('click', () => {
  const area = document.getElementById('uploadArea');
  area.style.display = area.style.display === 'none' ? '' : 'none';
});

const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click',     () => fileInput.click());
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  uploadFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

async function uploadFiles(fileList) {
  if (!fileList.length) return;

  const progress   = document.getElementById('uploadProgress');
  const statusEl   = document.getElementById('uploadStatus');
  const fillEl     = document.getElementById('progressFill');

  progress.classList.add('show');
  statusEl.textContent = `Uploading ${fileList.length} file(s)…`;
  fillEl.style.width   = '0%';

  const form = new FormData();
  for (const f of fileList) form.append('files', f);

  try {
    const xhr = new XMLHttpRequest();
    await new Promise((resolve, reject) => {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) fillEl.style.width = Math.round(e.loaded/e.total*100) + '%';
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.open('POST', '/api/files');
      xhr.send(form);
    });

    fillEl.style.width = '100%';
    statusEl.textContent = 'Upload complete!';
    fileInput.value = '';

    await loadFiles();
    refreshModalFilePicker();

    showAlert('filesSuccess', `${fileList.length} file(s) uploaded.`, 'success');
    setTimeout(() => {
      progress.classList.remove('show');
      document.getElementById('uploadArea').style.display = 'none';
    }, 1500);

  } catch (err) {
    showAlert('filesAlert', err.message);
    progress.classList.remove('show');
  }
}

// Delete file
document.getElementById('filesBody').addEventListener('click', async e => {
  const id = e.target.dataset.deleteFile;
  if (!id) return;
  if (!confirm('Delete this file? It will be removed from all groups.')) return;

  try {
    await api('DELETE', `/files/${id}`);
    myFiles = myFiles.filter(f => f.id !== id);
    // Remove from group state too
    myGroups.forEach(g => g.fileIds = g.fileIds.filter(fid => fid !== id));
    renderFiles();
    renderGroups();
    showAlert('filesSuccess', 'File deleted.', 'success');
  } catch (err) {
    showAlert('filesAlert', err.message);
  }
});

// ── Groups panel ──────────────────────────────────────────────────────────────
async function loadGroups() {
  myGroups = await api('GET', '/groups');
  renderGroups();
}

function renderGroups() {
  const table = document.getElementById('groupsTable');
  const empty = document.getElementById('groupsEmpty');
  const tbody = document.getElementById('groupsBody');

  tbody.innerHTML = '';

  if (myGroups.length === 0) {
    table.style.display = 'none';
    empty.style.display = '';
    return;
  }

  table.style.display = '';
  empty.style.display = 'none';

  myGroups.forEach(g => {
    const expired = isExpired(g);
    const statusBadge = expired
      ? '<span class="badge badge-expired">Expired</span>'
      : '<span class="badge badge-active">Active</span>';

    let expiryDisplay = '—';
    if (g.expiresAt) expiryDisplay = formatDate(g.expiresAt);
    else if (g.downloadLimit !== null) expiryDisplay = `${g.downloadCount}/${g.downloadLimit} dl`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(g.codename)}</strong></td>
      <td>${g.fileIds.length}</td>
      <td>${g.downloadCount || 0}</td>
      <td>${expiryDisplay}</td>
      <td>${statusBadge}</td>
      <td class="actions">
        <button class="btn btn-ghost" data-edit-group="${g.id}">Edit</button>
        <button class="btn btn-danger" data-delete-group="${g.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Also refresh file row group counts
  renderFiles();
}

document.getElementById('groupsBody').addEventListener('click', async e => {
  const editId   = e.target.dataset.editGroup;
  const deleteId = e.target.dataset.deleteGroup;

  if (editId) {
    openGroupModal(editId);
  }

  if (deleteId) {
    if (!confirm('Delete this group? Files will be kept.')) return;
    try {
      await api('DELETE', `/groups/${deleteId}`);
      myGroups = myGroups.filter(g => g.id !== deleteId);
      renderGroups();
      showAlert('groupsSuccess', 'Group deleted.', 'success');
    } catch (err) {
      showAlert('groupsAlert', err.message);
    }
  }
});

// ── Group modal ───────────────────────────────────────────────────────────────
const modal        = document.getElementById('groupModal');
const modalTitle   = document.getElementById('modalTitle');
const modalSaveBtn = document.getElementById('modalSave');
const gCodename    = document.getElementById('gCodename');
const gPassword    = document.getElementById('gPassword');
const gExpiryType  = document.getElementById('gExpiryType');
const gExpiryDate  = document.getElementById('gExpiryDate');
const gDownloadLimit = document.getElementById('gDownloadLimit');
const gExpiryDateField  = document.getElementById('gExpiryDateField');
const gExpiryCountField = document.getElementById('gExpiryCountField');

gExpiryType.addEventListener('change', () => {
  gExpiryDateField.style.display  = gExpiryType.value === 'date'  ? '' : 'none';
  gExpiryCountField.style.display = gExpiryType.value === 'count' ? '' : 'none';
});

document.getElementById('newGroupBtn').addEventListener('click',  () => openGroupModal(null));
document.getElementById('modalClose').addEventListener('click',   closeModal);
document.getElementById('modalCancel').addEventListener('click',  closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

function openGroupModal(groupId) {
  editingGroupId = groupId;
  document.getElementById('modalAlert').className = 'alert alert-error';

  if (groupId) {
    const g = myGroups.find(g => g.id === groupId);
    modalTitle.textContent    = 'Edit group';
    modalSaveBtn.textContent  = 'Save changes';
    gCodename.value           = g.codename;
    gPassword.value           = '';
    gPassword.placeholder     = 'Leave blank to keep current';

    if (g.expiresAt) {
      gExpiryType.value = 'date';
      // Format for datetime-local input
      gExpiryDate.value = new Date(g.expiresAt).toISOString().slice(0,16);
      gExpiryDateField.style.display  = '';
      gExpiryCountField.style.display = 'none';
    } else if (g.downloadLimit !== null) {
      gExpiryType.value         = 'count';
      gDownloadLimit.value      = g.downloadLimit;
      gExpiryDateField.style.display  = 'none';
      gExpiryCountField.style.display = '';
    } else {
      gExpiryType.value = 'never';
      gExpiryDateField.style.display  = 'none';
      gExpiryCountField.style.display = 'none';
    }

    buildFilePicker(g.fileIds);
  } else {
    modalTitle.textContent    = 'New shared group';
    modalSaveBtn.textContent  = 'Create group';
    gCodename.value           = '';
    gPassword.value           = '';
    gPassword.placeholder     = 'Min. 4 characters';
    gExpiryType.value         = 'never';
    gExpiryDateField.style.display  = 'none';
    gExpiryCountField.style.display = 'none';
    gDownloadLimit.value      = '';
    buildFilePicker([]);
  }

  modal.classList.add('open');
}

function closeModal() {
  modal.classList.remove('open');
  editingGroupId = null;
}

function buildFilePicker(selectedIds) {
  const picker = document.getElementById('filePicker');
  picker.innerHTML = '';

  if (myFiles.length === 0) {
    picker.innerHTML = '<label style="color:var(--muted)">No files uploaded yet</label>';
    return;
  }

  myFiles.forEach(f => {
    const label = document.createElement('label');
    const cb    = document.createElement('input');
    cb.type     = 'checkbox';
    cb.value    = f.id;
    cb.checked  = selectedIds.includes(f.id);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${f.originalName} (${formatBytes(f.size)})`));
    picker.appendChild(label);
  });
}

function refreshModalFilePicker() {
  if (!modal.classList.contains('open')) return;
  const checked = [...document.querySelectorAll('#filePicker input:checked')].map(c => c.value);
  buildFilePicker(checked);
}

modalSaveBtn.addEventListener('click', async () => {
  const codename = gCodename.value.trim();
  const password = gPassword.value;

  if (!editingGroupId && (!password || password.length < 4)) {
    document.getElementById('modalAlert').textContent = 'Password must be at least 4 characters.';
    document.getElementById('modalAlert').className   = 'alert alert-error show';
    return;
  }

  const fileIds = [...document.querySelectorAll('#filePicker input:checked')].map(c => c.value);

  let expiresAt     = null;
  let downloadLimit = null;
  if (gExpiryType.value === 'date') {
    if (!gExpiryDate.value) {
      document.getElementById('modalAlert').textContent = 'Please select an expiry date.';
      document.getElementById('modalAlert').className   = 'alert alert-error show';
      return;
    }
    expiresAt = new Date(gExpiryDate.value).toISOString();
  } else if (gExpiryType.value === 'count') {
    downloadLimit = parseInt(gDownloadLimit.value);
    if (!downloadLimit || downloadLimit < 1) {
      document.getElementById('modalAlert').textContent = 'Please enter a valid download limit.';
      document.getElementById('modalAlert').className   = 'alert alert-error show';
      return;
    }
  }

  const payload = { fileIds, expiresAt, downloadLimit };
  if (codename) payload.codename = codename;
  if (password) payload.password = password;

  modalSaveBtn.disabled = true;
  try {
    if (editingGroupId) {
      await api('PATCH', `/groups/${editingGroupId}`, payload);
      showAlert('groupsSuccess', 'Group updated.', 'success');
    } else {
      await api('POST', '/groups', payload);
      showAlert('groupsSuccess', 'Group created.', 'success');
    }
    await loadGroups();
    closeModal();
  } catch (err) {
    document.getElementById('modalAlert').textContent = err.message;
    document.getElementById('modalAlert').className   = 'alert alert-error show';
  } finally {
    modalSaveBtn.disabled = false;
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
