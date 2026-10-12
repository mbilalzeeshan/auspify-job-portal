// app.js - CareerLink single-page app (vanilla JS, no dependencies).
// Hash-based routing: #/ (board), #/jobs/:id (detail), #/login, #/register,
// #/dashboard (role-aware), #/admin (admin only).

const state = {
  token: localStorage.getItem('cl_token') || null,
  user: JSON.parse(localStorage.getItem('cl_user') || 'null'),
};

const $ = (sel) => document.querySelector(sel);

// Escape user-provided text before injecting into HTML.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtSalary(min, max) {
  const f = (n) => 'PKR ' + Number(n).toLocaleString('en-PK');
  if (min != null && max != null) return `${f(min)} - ${f(max)} / month`;
  if (min != null) return `${f(min)}+ / month`;
  if (max != null) return `Up to ${f(max)} / month`;
  return 'Salary not specified';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('cl_token', token);
  localStorage.setItem('cl_user', JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('cl_token');
  localStorage.removeItem('cl_user');
}

// ---------------------------------------------------------------------------
// Navigation / header
// ---------------------------------------------------------------------------
function refreshNav() {
  const loggedIn = !!state.user;
  $('#nav-dashboard').classList.toggle('hidden', !loggedIn);
  $('#nav-admin').classList.toggle('hidden', !(loggedIn && state.user.role === 'admin'));
  const area = $('#auth-area');
  if (loggedIn) {
    area.innerHTML = `<span class="user-chip">${esc(state.user.name)} (${esc(state.user.role)})</span>
      <button class="btn btn-ghost" id="logout-btn">Log out</button>`;
    $('#logout-btn').addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* token may be stale */ }
      clearSession();
      refreshNav();
      location.hash = '#/';
    });
  } else {
    area.innerHTML = `<a href="#/login" class="btn btn-ghost">Log in</a>
      <a href="#/register" class="btn btn-primary">Sign up</a>`;
  }
}

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.nav a[data-nav]').forEach((a) => a.classList.remove('active'));
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/jobs/')) {
    renderJobDetail(hash.split('/')[2]);
  } else if (hash === '#/login') {
    showView('#view-login');
  } else if (hash === '#/register') {
    showView('#view-register');
  } else if (hash === '#/dashboard') {
    if (!state.user) { location.hash = '#/login'; return; }
    if (state.user.role === 'seeker') renderSeekerDashboard();
    else if (state.user.role === 'employer') renderEmployerDashboard();
    else renderAdminDashboard();
  } else if (hash === '#/admin') {
    if (!state.user) { location.hash = '#/login'; return; }
    if (state.user.role !== 'admin') { location.hash = '#/dashboard'; return; }
    renderAdminDashboard();
  } else {
    renderBoard();
  }
  refreshNav();
}

// ---------------------------------------------------------------------------
// Job board (home)
// ---------------------------------------------------------------------------
async function renderBoard() {
  showView('#view-home');
  const q = $('#search-q').value.trim();
  const location = $('#search-location').value.trim();
  const type = $('#search-type').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (location) params.set('location', location);
  if (type) params.set('type', type);
  const list = $('#job-list');
  list.innerHTML = '<p class="empty">Loading jobs...</p>';
  try {
    const jobs = await api('/api/jobs' + (params.toString() ? '?' + params : ''));
    $('#job-count').textContent = jobs.length ? `${jobs.length} opening${jobs.length === 1 ? '' : 's'} found` : '';
    list.innerHTML = jobs.length ? jobs.map(jobCard).join('') : '<p class="empty">No jobs match your search. Try different keywords.</p>';
  } catch (e) {
    list.innerHTML = `<p class="empty">Could not load jobs: ${esc(e.message)}</p>`;
  }
}

function jobCard(j) {
  return `<article class="card job-card">
    <h3><a href="#/jobs/${j.id}">${esc(j.title)}</a></h3>
    <div class="job-meta"><strong>${esc(j.company)}</strong><span>${esc(j.location)}</span></div>
    <div><span class="tag">${esc(j.type)}</span></div>
    <div class="salary">${esc(fmtSalary(j.salaryMin, j.salaryMax))}</div>
    <p class="desc">${esc(j.description.slice(0, 140))}${j.description.length > 140 ? '...' : ''}</p>
  </article>`;
}

// ---------------------------------------------------------------------------
// Job detail + apply
// ---------------------------------------------------------------------------
async function renderJobDetail(id) {
  showView('#view-job');
  const el = $('#job-detail');
  el.innerHTML = '<p class="muted">Loading...</p>';
  let job;
  try {
    job = await api('/api/jobs/' + id);
  } catch (e) {
    el.innerHTML = `<p class="empty">Job not found.</p>`;
    return;
  }

  const canApply = state.user && state.user.role === 'seeker';
  el.innerHTML = `<div class="card detail-card">
    <h1>${esc(job.title)}</h1>
    <div class="job-meta"><strong>${esc(job.company)}</strong><span>${esc(job.location)}</span></div>
    <div style="margin-top:8px"><span class="tag">${esc(job.type)}</span></div>
    <div class="salary" style="margin-top:8px">${esc(fmtSalary(job.salaryMin, job.salaryMax))}</div>
    <div class="detail-section"><h3>About the role</h3><p>${esc(job.description)}</p></div>
    <div class="detail-section"><h3>Requirements</h3><p>${esc(job.requirements)}</p></div>
    ${canApply ? `
      <div class="apply-box">
        <h3>Apply for this job</h3>
        <form id="apply-form">
          <label style="display:block;font-weight:600;margin-bottom:8px">Cover note
            <textarea id="cover-note" placeholder="Tell the employer why you are a good fit..."></textarea>
          </label>
          <p class="form-error hidden" id="apply-error"></p>
          <button class="btn btn-primary" type="submit">Submit application</button>
        </form>
      </div>` : ''}
    ${!state.user ? `<div class="apply-box"><p class="muted"><a href="#/login">Log in as a job seeker</a> to apply for this role.</p></div>` : ''}
  </div>`;

  const form = $('#apply-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('#apply-error');
      errEl.classList.add('hidden');
      try {
        await api(`/api/jobs/${job.id}/apply`, {
          method: 'POST',
          body: JSON.stringify({ coverNote: $('#cover-note').value.trim() }),
        });
        el.querySelector('.apply-box').innerHTML = '<p><strong>Application submitted.</strong> Track its status from your dashboard.</p>';
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Seeker dashboard
// ---------------------------------------------------------------------------
async function renderSeekerDashboard() {
  showView('#view-seeker');
  const el = $('#seeker-apps');
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const apps = await api('/api/applications/me');
    el.innerHTML = apps.length ? apps.map((a) => `
      <div class="card posting">
        <div class="posting-head">
          <div>
            <h3>${esc(a.job.title)}</h3>
            <div class="job-meta"><strong>${esc(a.job.company)}</strong><span>${esc(a.job.location)}</span></div>
          </div>
          <span class="status status-${a.status}">${esc(a.status)}</span>
        </div>
        ${a.coverNote ? `<p class="muted">Your note: ${esc(a.coverNote)}</p>` : ''}
        <p class="muted" style="font-size:0.85rem">Applied ${esc(new Date(a.createdAt).toLocaleDateString())}</p>
      </div>`).join('')
      : '<p class="empty">You have not applied to any jobs yet. <a href="#/">Browse openings</a>.</p>';
  } catch (e) {
    el.innerHTML = `<p class="empty">Could not load applications: ${esc(e.message)}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Employer dashboard
// ---------------------------------------------------------------------------
async function renderEmployerDashboard() {
  showView('#view-employer');
  $('#job-form-wrap').classList.add('hidden');
  const el = $('#employer-jobs');
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const jobs = await api('/api/jobs?q=' + encodeURIComponent('')); // fetch all, filter client-side
    const mine = jobs.filter((j) => j.employerId === state.user.id);
    el.innerHTML = mine.length ? '' : '<p class="empty">No postings yet. Click "Post a job" to create your first listing.</p>';
    for (const job of mine) {
      const card = document.createElement('div');
      card.className = 'card posting';
      let applicants = [];
      try { applicants = await api(`/api/jobs/${job.id}/applications`); } catch (e) { /* show job anyway */ }
      card.innerHTML = `
        <div class="posting-head">
          <div>
            <h3>${esc(job.title)}</h3>
            <div class="job-meta"><span>${esc(job.location)}</span><span class="tag">${esc(job.type)}</span><span>${esc(fmtSalary(job.salaryMin, job.salaryMax))}</span></div>
          </div>
          <div class="posting-actions">
            <button class="btn btn-ghost btn-small" data-edit="${job.id}">Edit</button>
            <button class="btn btn-danger btn-small" data-del="${job.id}">Delete</button>
          </div>
        </div>
        <div class="applicants">
          <strong>Applicants (${applicants.length})</strong>
          ${applicants.length ? applicants.map((a) => `
            <div class="applicant">
              <div><strong>${esc(a.seekerName || 'Applicant')}</strong><br><span class="muted" style="font-size:0.85rem">${esc(a.seekerEmail || '')}</span></div>
              <div style="display:flex;gap:8px;align-items:center">
                <select class="status-select" data-app="${a.id}">
                  ${['applied', 'reviewed', 'accepted', 'rejected'].map((s) =>
                    `<option value="${s}" ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
              ${a.coverNote ? `<div class="cover">"${esc(a.coverNote)}"</div>` : ''}
            </div>`).join('') : '<p class="muted">No applicants yet.</p>'}
        </div>`;
      el.appendChild(card);
    }

    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => showJobForm(mine.find((j) => j.id == b.dataset.edit))));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this job posting and all its applications?')) return;
      await api('/api/jobs/' + b.dataset.del, { method: 'DELETE' });
      renderEmployerDashboard();
    }));
    el.querySelectorAll('[data-app]').forEach((s) => s.addEventListener('change', async () => {
      try {
        await api('/api/applications/' + s.dataset.app, {
          method: 'PATCH',
          body: JSON.stringify({ status: s.value }),
        });
      } catch (err) {
        alert('Could not update status: ' + err.message);
        renderEmployerDashboard();
      }
    }));
  } catch (e) {
    el.innerHTML = `<p class="empty">Could not load your postings: ${esc(e.message)}</p>`;
  }
}

function showJobForm(existing) {
  const wrap = $('#job-form-wrap');
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<div class="card" style="margin-bottom:18px">
    <h3>${existing ? 'Edit job' : 'Post a new job'}</h3>
    <form id="job-form" class="stacked-form">
      <div class="form-row">
        <label>Job title <input name="title" required value="${esc(existing?.title || '')}" /></label>
        <label>Company <input name="company" required value="${esc(existing?.company || '')}" /></label>
      </div>
      <div class="form-row">
        <label>Location <input name="location" required value="${esc(existing?.location || '')}" placeholder="Karachi, Lahore, Remote..." /></label>
        <label>Type <select name="type" required>
          ${['Full-time', 'Part-time', 'Remote', 'Contract'].map((t) =>
            `<option ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
      </div>
      <div class="form-row">
        <label>Salary min (PKR) <input name="salaryMin" type="number" min="0" value="${existing?.salaryMin ?? ''}" /></label>
        <label>Salary max (PKR) <input name="salaryMax" type="number" min="0" value="${existing?.salaryMax ?? ''}" /></label>
      </div>
      <label>Description <textarea name="description" rows="4" required>${esc(existing?.description || '')}</textarea></label>
      <label>Requirements <textarea name="requirements" rows="3" required>${esc(existing?.requirements || '')}</textarea></label>
      <p class="form-error hidden" id="job-form-error"></p>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" type="submit">${existing ? 'Save changes' : 'Post job'}</button>
        <button class="btn btn-ghost" type="button" id="job-form-cancel">Cancel</button>
      </div>
    </form>
  </div>`;
  $('#job-form-cancel').addEventListener('click', () => wrap.classList.add('hidden'));
  $('#job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = {
      title: f.get('title'), company: f.get('company'), location: f.get('location'),
      type: f.get('type'), description: f.get('description'), requirements: f.get('requirements'),
    };
    if (f.get('salaryMin') !== '') payload.salaryMin = Number(f.get('salaryMin'));
    if (f.get('salaryMax') !== '') payload.salaryMax = Number(f.get('salaryMax'));
    const errEl = $('#job-form-error');
    errEl.classList.add('hidden');
    try {
      if (existing) await api('/api/jobs/' + existing.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
      renderEmployerDashboard();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------
async function renderAdminDashboard() {
  showView('#view-admin');
  try {
    const s = await api('/api/admin/stats');
    $('#admin-stats').innerHTML = `
      <div class="card stat"><div class="num">${s.totalUsers}</div><div class="label">Total users</div></div>
      <div class="card stat"><div class="num">${s.totalEmployers}</div><div class="label">Employers</div></div>
      <div class="card stat"><div class="num">${s.totalJobs}</div><div class="label">Jobs posted</div></div>
      <div class="card stat"><div class="num">${s.totalApplications}</div><div class="label">Applications</div></div>`;
    $('#admin-jobs').innerHTML = `<table><tr><th>ID</th><th>Title</th><th>Company</th><th>Location</th><th>Type</th></tr>
      ${s.recentJobs.map((j) => `<tr><td>${j.id}</td><td>${esc(j.title)}</td><td>${esc(j.company)}</td><td>${esc(j.location)}</td><td>${esc(j.type)}</td></tr>`).join('')}</table>`;
    $('#admin-apps').innerHTML = `<table><tr><th>ID</th><th>Job</th><th>Seeker</th><th>Status</th></tr>
      ${s.recentApplications.map((a) => `<tr><td>${a.id}</td><td>${esc(a.jobTitle)}</td><td>${esc(a.seekerName)}</td><td><span class="status status-${a.status}">${esc(a.status)}</span></td></tr>`).join('')}</table>`;
  } catch (e) {
    $('#admin-stats').innerHTML = `<p class="empty">Could not load stats: ${esc(e.message)}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Auth forms
// ---------------------------------------------------------------------------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const errEl = $('#login-error');
  errEl.classList.add('hidden');
  try {
    const { token, user } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
    });
    saveSession(token, user);
    location.hash = '#/dashboard';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const errEl = $('#register-error');
  errEl.classList.add('hidden');
  try {
    const { token, user } = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: f.get('name'), email: f.get('email'),
        password: f.get('password'), role: f.get('role'),
      }),
    });
    saveSession(token, user);
    location.hash = '#/dashboard';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
$('#search-btn').addEventListener('click', renderBoard);
$('#search-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderBoard(); });
$('#search-location').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderBoard(); });
$('#search-type').addEventListener('change', renderBoard);
$('#search-clear').addEventListener('click', () => {
  $('#search-q').value = '';
  $('#search-location').value = '';
  $('#search-type').value = '';
  renderBoard();
});
$('#new-job-btn').addEventListener('click', () => showJobForm(null));

window.addEventListener('hashchange', route);
route();
