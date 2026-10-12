// db.js - SQLite persistence layer (better-sqlite3).
// Handles schema creation, seeding of demo data and all database access.
// Everything is synchronous, which keeps the code simple and easy to follow.

const path = require('path');
const Database = require('better-sqlite3');

const DB_FILE = path.join(__dirname, 'careerlink.db');
const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('seeker', 'employer', 'admin')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Full-time', 'Part-time', 'Remote', 'Contract')),
    salary_min INTEGER,
    salary_max INTEGER,
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    seeker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cover_note TEXT,
    status TEXT NOT NULL DEFAULT 'applied'
      CHECK (status IN ('applied', 'reviewed', 'accepted', 'rejected')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (job_id, seeker_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
`);

// ---------------------------------------------------------------------------
// Seed data (runs once, on a fresh database)
// ---------------------------------------------------------------------------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const crypto = require('crypto');
  const now = new Date().toISOString();

  const makeUser = db.prepare(
    'INSERT INTO users (name, email, salt, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const createUser = (name, email, password, role) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return makeUser.run(name, email, salt, hash, role, now).lastInsertRowid;
  };

  // Demo accounts (documented in the README)
  const employerId = createUser('Areeba Khan', 'employer@example.com', 'employer123', 'employer');
  const seekerId = createUser('Danish Ali', 'demo@example.com', 'demo123', 'seeker');
  const seeker2Id = createUser('Mahnoor Fatima', 'mahnoor@example.com', 'seeker1234', 'seeker');
  createUser('Portal Admin', 'admin@example.com', 'admin123', 'admin');

  // 12 realistic sample jobs from fictional companies (PKR monthly salaries)
  const jobs = [
    ['Frontend Developer (React)', 'PixelWorks Studio', 'Karachi', 'Full-time', 150000, 220000,
     'Build and maintain customer-facing web apps used by thousands of users every day. You will work closely with designers and backend engineers in an agile team.',
     '2+ years with React, strong JavaScript fundamentals, experience with REST APIs, Git workflow'],
    ['Backend Developer (Node.js)', 'NexaByte Solutions', 'Lahore', 'Full-time', 180000, 250000,
     'Design and scale the APIs that power our SaaS platform. Own features end to end, from database schema to deployment.',
     '3+ years Node.js and Express, PostgreSQL, writing tests, familiarity with Docker'],
    ['Python Data Analyst', 'DataCrest Analytics', 'Remote', 'Remote', 120000, 180000,
     'Turn raw business data into dashboards and reports that drive decisions. Fully remote role with flexible hours.',
     'Strong Python and pandas skills, SQL, data visualisation, clear written communication'],
    ['UI/UX Designer', 'Craftly Design Co.', 'Karachi', 'Full-time', 140000, 200000,
     'Design intuitive interfaces for web and mobile products. You will run user research and ship high-fidelity prototypes.',
     'Portfolio of shipped work, Figma expertise, understanding of design systems'],
    ['DevOps Engineer', 'CloudNest Technologies', 'Remote', 'Remote', 220000, 300000,
     'Keep our cloud infrastructure fast, secure and reliable. Automate deployments and own our CI/CD pipelines.',
     'AWS or Azure, Terraform, CI/CD pipelines, Linux administration, on-call readiness'],
    ['Digital Marketing Specialist', 'BrandRise Media', 'Lahore', 'Part-time', 80000, 110000,
     'Run paid and organic campaigns for e-commerce clients. 20 hours per week, hybrid schedule.',
     'Hands-on Meta and Google Ads experience, basic analytics, copywriting flair'],
    ['Mobile App Developer (Flutter)', 'AppForge Labs', 'Karachi', 'Full-time', 170000, 240000,
     'Ship cross-platform mobile apps from idea to Play Store and App Store. Small senior team, big ownership.',
     '2+ years Flutter and Dart, published apps, REST integration, state management'],
    ['Technical Content Writer', 'DocuMint', 'Remote', 'Contract', 90000, 130000,
     'Write developer documentation and tutorials for a docs-as-a-service product. Six month contract, renewable.',
     'Excellent technical English, ability to read code samples, documentation portfolio'],
    ['Cybersecurity Intern', 'SentinelSix Security', 'Karachi', 'Contract', 60000, 80000,
     'Learn the ropes of blue-team security work: log analysis, alert triage and basic threat hunting. Paid three month internship.',
     'Networking basics, curiosity about security, Linux familiarity, eagerness to learn'],
    ['QA Engineer', 'TestPilot Systems', 'Lahore', 'Full-time', 130000, 190000,
     'Own quality for a growing product suite. Write automated tests and keep our release pipeline green.',
     'Test automation with Cypress or Playwright, API testing, bug reporting discipline'],
    ['AI/ML Engineer', 'MindMesh AI', 'Remote', 'Full-time', 250000, 350000,
     'Build production machine learning features, from prompt engineering to fine-tuning and evaluation pipelines.',
     'Python, PyTorch or TensorFlow, LLM APIs, MLOps basics, shipped ML projects'],
    ['Customer Support Executive', 'HelpHub Services', 'Karachi', 'Full-time', 70000, 100000,
     'Be the friendly first line of support for our clients. Day shifts with a supportive team lead and clear growth path.',
     'Good spoken and written English/Urdu, patience, basic computer skills'],
  ];

  const insertJob = db.prepare(`
    INSERT INTO jobs (employer_id, title, company, location, type, salary_min, salary_max,
                      description, requirements, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const jobIds = jobs.map((j) => insertJob.run(employerId, ...j, now).lastInsertRowid);

  // 4 sample applications in various statuses from the two demo seekers
  const insertApp = db.prepare(`
    INSERT INTO applications (job_id, seeker_id, cover_note, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertApp.run(jobIds[0], seekerId, 'I have two years of React experience and would love to contribute.', 'applied', now, now);
  insertApp.run(jobIds[2], seekerId, 'Python and pandas are my daily tools at university projects.', 'reviewed', now, now);
  insertApp.run(jobIds[6], seeker2Id, 'I shipped two Flutter apps during my internship last summer.', 'accepted', now, now);
  insertApp.run(jobIds[10], seeker2Id, 'Final year AI project focused on LLM evaluation pipelines.', 'rejected', now, now);

  console.log('Database seeded with demo accounts, 12 jobs and 4 applications.');
}

seed();

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------
function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at };
}

module.exports = {
  db,

  // Users
  findUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()),
  findUserById: (id) => publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
  findUserRawById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  createUser: (name, email, salt, hash, role) => {
    const info = db.prepare(
      'INSERT INTO users (name, email, salt, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, email.trim().toLowerCase(), salt, hash, role, new Date().toISOString());
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
  },

  // Sessions (Bearer tokens persisted in the database)
  createSession: (token, userId) =>
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
      .run(token, userId, new Date().toISOString()),
  findSession: (token) => db.prepare('SELECT * FROM sessions WHERE token = ?').get(token),
  deleteSession: (token) => db.prepare('DELETE FROM sessions WHERE token = ?').run(token),

  // Jobs
  createJob: (job) => {
    const info = db.prepare(`
      INSERT INTO jobs (employer_id, title, company, location, type, salary_min, salary_max,
                        description, requirements, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job.employerId, job.title, job.company, job.location, job.type,
            job.salaryMin ?? null, job.salaryMax ?? null,
            job.description, job.requirements, new Date().toISOString());
    return module.exports.findJobById(info.lastInsertRowid);
  },
  findJobById: (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id),
  listJobs: (filters) => {
    const where = [];
    const params = [];
    if (filters.q) {
      where.push('(title LIKE ? OR company LIKE ? OR description LIKE ?)');
      const like = `%${filters.q}%`;
      params.push(like, like, like);
    }
    if (filters.location) {
      where.push('location LIKE ?');
      params.push(`%${filters.location}%`);
    }
    if (filters.type) {
      where.push('type = ?');
      params.push(filters.type);
    }
    const sql = `SELECT * FROM jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`;
    return db.prepare(sql).all(...params);
  },
  listJobsByEmployer: (employerId) =>
    db.prepare('SELECT * FROM jobs WHERE employer_id = ? ORDER BY created_at DESC, id DESC').all(employerId),
  updateJob: (id, job) => {
    db.prepare(`
      UPDATE jobs SET title = ?, company = ?, location = ?, type = ?,
                      salary_min = ?, salary_max = ?, description = ?, requirements = ?
      WHERE id = ?
    `).run(job.title, job.company, job.location, job.type,
            job.salaryMin ?? null, job.salaryMax ?? null,
            job.description, job.requirements, id);
    return module.exports.findJobById(id);
  },
  deleteJob: (id) => db.prepare('DELETE FROM jobs WHERE id = ?').run(id),

  // Applications
  createApplication: (jobId, seekerId, coverNote) => {
    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO applications (job_id, seeker_id, cover_note, status, created_at, updated_at)
      VALUES (?, ?, ?, 'applied', ?, ?)
    `).run(jobId, seekerId, coverNote || null, now, now);
    return module.exports.findApplicationById(info.lastInsertRowid);
  },
  findApplicationById: (id) => db.prepare('SELECT * FROM applications WHERE id = ?').get(id),
  findApplicationByJobAndSeeker: (jobId, seekerId) =>
    db.prepare('SELECT * FROM applications WHERE job_id = ? AND seeker_id = ?').get(jobId, seekerId),
  listApplicationsForSeeker: (seekerId) =>
    db.prepare(`
      SELECT a.*, j.title AS job_title, j.company AS job_company, j.location AS job_location, j.type AS job_type
      FROM applications a JOIN jobs j ON j.id = a.job_id
      WHERE a.seeker_id = ? ORDER BY a.created_at DESC, a.id DESC
    `).all(seekerId),
  listApplicationsForJob: (jobId) =>
    db.prepare(`
      SELECT a.*, u.name AS seeker_name, u.email AS seeker_email
      FROM applications a JOIN users u ON u.id = a.seeker_id
      WHERE a.job_id = ? ORDER BY a.created_at DESC, a.id DESC
    `).all(jobId),
  updateApplicationStatus: (id, status) => {
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
    return module.exports.findApplicationById(id);
  },

  // Admin
  adminStats: () => ({
    totalUsers: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
    totalJobs: db.prepare("SELECT COUNT(*) AS c FROM jobs").get().c,
    totalApplications: db.prepare("SELECT COUNT(*) AS c FROM applications").get().c,
    totalEmployers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'employer'").get().c,
    recentJobs: db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, id DESC LIMIT 8').all(),
    recentApplications: db.prepare(`
      SELECT a.*, j.title AS job_title, u.name AS seeker_name
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN users u ON u.id = a.seeker_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 8
    `).all(),
  }),
};
