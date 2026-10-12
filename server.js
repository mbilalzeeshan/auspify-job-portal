// server.js - CareerLink job portal: Express REST API + static frontend.
// Start with: npm install && npm start   (listens on process.env.PORT || 3004)

const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');

const PORT = process.env.PORT || 3004;
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Small validation helpers
// ---------------------------------------------------------------------------
const JOB_TYPES = ['Full-time', 'Part-time', 'Remote', 'Contract'];
const APP_STATUSES = ['applied', 'reviewed', 'accepted', 'rejected'];

function validateJob(body) {
  const { title, company, location, type, salaryMin, salaryMax, description, requirements } = body || {};
  if (!title || !company || !location || !type || !description || !requirements) {
    return 'title, company, location, type, description and requirements are required.';
  }
  if (!JOB_TYPES.includes(type)) {
    return `type must be one of: ${JOB_TYPES.join(', ')}.`;
  }
  if (salaryMin != null && (isNaN(Number(salaryMin)) || Number(salaryMin) < 0)) {
    return 'salaryMin must be a non-negative number.';
  }
  if (salaryMax != null && (isNaN(Number(salaryMax)) || Number(salaryMax) < 0)) {
    return 'salaryMax must be a non-negative number.';
  }
  if (salaryMin != null && salaryMax != null && Number(salaryMin) > Number(salaryMax)) {
    return 'salaryMin cannot be greater than salaryMax.';
  }
  return null;
}

function shapeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    employerId: row.employer_id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    description: row.description,
    requirements: row.requirements,
    createdAt: row.created_at,
  };
}

function shapeApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    seekerId: row.seeker_id,
    coverNote: row.cover_note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post('/api/auth/register', auth.register);
app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.requireAuth, auth.logout);
app.get('/api/auth/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));

// ---------------------------------------------------------------------------
// Job routes
// ---------------------------------------------------------------------------

// Public: list jobs with optional ?q= keyword, ?location= and ?type= filters.
app.get('/api/jobs', (req, res) => {
  const jobs = db.listJobs({
    q: (req.query.q || '').trim() || null,
    location: (req.query.location || '').trim() || null,
    type: req.query.type || null,
  });
  res.json(jobs.map(shapeJob));
});

// Public: single job by id.
app.get('/api/jobs/:id', (req, res) => {
  const job = shapeJob(db.findJobById(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json(job);
});

// Employer: post a new job.
app.post('/api/jobs', auth.requireAuth, auth.requireRole('employer', 'admin'), (req, res) => {
  const err = validateJob(req.body);
  if (err) return res.status(400).json({ error: err });
  const job = db.createJob({
    employerId: req.user.id,
    title: req.body.title.trim(),
    company: req.body.company.trim(),
    location: req.body.location.trim(),
    type: req.body.type,
    salaryMin: req.body.salaryMin != null ? Number(req.body.salaryMin) : null,
    salaryMax: req.body.salaryMax != null ? Number(req.body.salaryMax) : null,
    description: req.body.description.trim(),
    requirements: req.body.requirements.trim(),
  });
  res.status(201).json(shapeJob(job));
});

// Employer: update one of their own jobs.
app.put('/api/jobs/:id', auth.requireAuth, auth.requireRole('employer', 'admin'), (req, res) => {
  const job = db.findJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.employer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only edit your own job postings.' });
  }
  const err = validateJob(req.body);
  if (err) return res.status(400).json({ error: err });
  const updated = db.updateJob(job.id, {
    title: req.body.title.trim(),
    company: req.body.company.trim(),
    location: req.body.location.trim(),
    type: req.body.type,
    salaryMin: req.body.salaryMin != null ? Number(req.body.salaryMin) : null,
    salaryMax: req.body.salaryMax != null ? Number(req.body.salaryMax) : null,
    description: req.body.description.trim(),
    requirements: req.body.requirements.trim(),
  });
  res.json(shapeJob(updated));
});

// Employer: delete one of their own jobs (applications go with it).
app.delete('/api/jobs/:id', auth.requireAuth, auth.requireRole('employer', 'admin'), (req, res) => {
  const job = db.findJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.employer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own job postings.' });
  }
  db.deleteJob(job.id);
  res.json({ message: 'Job deleted.' });
});

// Employer: see all applications for one of their own jobs.
app.get('/api/jobs/:id/applications', auth.requireAuth, auth.requireRole('employer', 'admin'), (req, res) => {
  const job = db.findJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.employer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only view applications for your own job postings.' });
  }
  res.json(db.listApplicationsForJob(job.id).map(shapeApplication));
});

// ---------------------------------------------------------------------------
// Application routes
// ---------------------------------------------------------------------------

// Seeker: apply to a job. Duplicates are rejected with 409.
app.post('/api/jobs/:id/apply', auth.requireAuth, auth.requireRole('seeker'), (req, res) => {
  const job = db.findJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (db.findApplicationByJobAndSeeker(job.id, req.user.id)) {
    return res.status(409).json({ error: 'You have already applied to this job.' });
  }
  const application = db.createApplication(job.id, req.user.id, (req.body && req.body.coverNote) || '');
  res.status(201).json(shapeApplication(application));
});

// Seeker: list own applications, with job info attached.
app.get('/api/applications/me', auth.requireAuth, auth.requireRole('seeker'), (req, res) => {
  const rows = db.listApplicationsForSeeker(req.user.id);
  res.json(rows.map((r) => ({
    ...shapeApplication(r),
    job: { title: r.job_title, company: r.job_company, location: r.job_location, type: r.job_type },
  })));
});

// Employer: update an application's status. Only the job owner may do this.
app.patch('/api/applications/:id', auth.requireAuth, auth.requireRole('employer', 'admin'), (req, res) => {
  const { status } = req.body || {};
  if (!APP_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${APP_STATUSES.join(', ')}.` });
  }
  const application = db.findApplicationById(req.params.id);
  if (!application) return res.status(404).json({ error: 'Application not found.' });
  const job = db.findJobById(application.job_id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.employer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the employer who posted this job can update its applications.' });
  }
  res.json(shapeApplication(db.updateApplicationStatus(application.id, status)));
});

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

// Admin: dashboard stats plus recent jobs and applications.
app.get('/api/admin/stats', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
  const stats = db.adminStats();
  res.json({
    totalUsers: stats.totalUsers,
    totalJobs: stats.totalJobs,
    totalApplications: stats.totalApplications,
    totalEmployers: stats.totalEmployers,
    recentJobs: stats.recentJobs.map(shapeJob),
    recentApplications: stats.recentApplications.map((r) => ({
      ...shapeApplication(r),
      jobTitle: r.job_title,
      seekerName: r.seeker_name,
    })),
  });
});

// SPA fallback: unknown non-API routes serve the frontend.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CareerLink job portal running at http://localhost:${PORT}`);
});
