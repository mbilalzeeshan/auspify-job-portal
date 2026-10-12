# CareerLink, a Job Portal

CareerLink is a full-stack job portal built for the Auspify Technologies Full Stack Development internship. Job seekers can browse openings, search and filter them, and apply. Employers can post jobs, manage their listings, and review applicants. Admins get a dashboard with platform stats.

## Features

- Role-based authentication: seeker, employer, admin (role chosen at registration)
- Salted scrypt password hashing with per-user salts (node:crypto), Bearer token sessions
- Employers: post, edit and delete their own job listings
- Public job board with keyword search, location filter and job-type filter
- Seekers: apply to jobs with a cover note, duplicate applications blocked
- Seeker dashboard: track applications and their statuses
- Employer dashboard: view applicants per job and update application statuses
- Admin dashboard: platform stats plus recent jobs and applications
- Responsive layout that works on mobile (375px) and desktop

## Tech Stack

- Backend: Node.js with Express
- Database: SQLite via better-sqlite3 (native module, prebuilt binary)
- Frontend: vanilla HTML, CSS and JavaScript, no frameworks, no CDN, works fully offline
- Passwords: scrypt from node:crypto with random 16-byte salts

## Setup

```bash
npm install
npm start
```

The server listens on `process.env.PORT` or `3004` by default. Open http://localhost:3004 in your browser.

On first run the database file `careerlink.db` is created and seeded automatically with demo accounts, 12 jobs and 4 sample applications.

## Demo credentials

| Role     | Email               | Password    |
|----------|---------------------|-------------|
| Seeker   | demo@example.com    | demo123     |
| Employer | employer@example.com| employer123 |
| Admin    | admin@example.com   | admin123    |

## API endpoints

All endpoints return JSON. Authenticated endpoints expect `Authorization: Bearer <token>`.

### Auth

| Method | Path              | Description                        | Auth        |
|--------|-------------------|------------------------------------|-------------|
| POST   | /api/auth/register| Register, body: name, email, password, role (seeker or employer) | Public |
| POST   | /api/auth/login   | Log in, body: email, password, returns token and user | Public |
| POST   | /api/auth/logout  | Invalidate the current token       | Token       |
| GET    | /api/auth/me      | Current user profile               | Token       |

### Jobs

| Method | Path                | Description                                   | Auth        |
|--------|---------------------|-----------------------------------------------|-------------|
| GET    | /api/jobs           | List jobs, optional ?q= keyword, ?location=, ?type= filters | Public |
| GET    | /api/jobs/:id       | Single job by id                              | Public      |
| POST   | /api/jobs           | Post a job (title, company, location, type, salaryMin, salaryMax, description, requirements) | Employer |
| PUT    | /api/jobs/:id       | Edit a job                                    | Owner only  |
| DELETE | /api/jobs/:id       | Delete a job (its applications are removed too) | Owner only |

### Applications

| Method | Path                       | Description                                              | Auth        |
|--------|----------------------------|----------------------------------------------------------|-------------|
| POST   | /api/jobs/:id/apply        | Apply to a job, body: coverNote, 409 on duplicate        | Seeker      |
| GET    | /api/applications/me       | Seeker's own applications with job info and status       | Seeker      |
| GET    | /api/jobs/:id/applications | All applications for a job                              | Owner only  |
| PATCH  | /api/applications/:id      | Update status (applied, reviewed, accepted, rejected)    | Owner only  |

### Admin

| Method | Path              | Description                                                        | Auth  |
|--------|-------------------|--------------------------------------------------------------------|-------|
| GET    | /api/admin/stats  | totalUsers, totalJobs, totalApplications, totalEmployers, recent jobs and applications | Admin |

Notes: endpoints that require a token return 401 without one. Actions outside your role return 403.

## Project structure

```
job-portal/
  server.js        Express app, REST API routes, serves the frontend
  db.js            SQLite layer: schema, seed data, query helpers
  auth.js          Registration, login, scrypt hashing, auth middleware
  public/
    index.html     Single-page app shell
    styles.css     Custom CSS, CareerLink visual identity
    app.js         Frontend logic: routing, dashboards, API calls
  package.json
  .gitignore
  README.md
```

## Notes

- The database file `careerlink.db` is gitignored, delete it to reseed from scratch.
- Seed jobs use fictional companies with realistic PKR monthly salary ranges.
