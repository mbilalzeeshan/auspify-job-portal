// auth.js - authentication helpers and middleware.
// Passwords are hashed with scrypt (node:crypto) using a random salt per user.
// Login issues a random Bearer token stored in the sessions table.

const crypto = require('crypto');
const db = require('./db');

const TOKEN_BYTES = 32;
const SCRYPT_KEYLEN = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

// POST /api/auth/register
// Public. Creates a seeker or employer account and returns a fresh token.
function register(req, res) {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const chosenRole = role || 'seeker';
  if (!['seeker', 'employer'].includes(chosenRole)) {
    return res.status(400).json({ error: 'Role must be seeker or employer.' });
  }
  if (db.findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const user = db.createUser(name.trim(), email, salt, hash, chosenRole);
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  db.createSession(token, user.id);

  return res.status(201).json({ token, user });
}

// POST /api/auth/login
// Public. Verifies credentials and returns a fresh token.
function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const raw = db.findUserByEmail(email);
  if (!raw) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const expected = hashPassword(password, raw.salt);
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(raw.hash, 'hex'))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  db.createSession(token, raw.id);
  const user = { id: raw.id, name: raw.name, email: raw.email, role: raw.role };
  return res.json({ token, user });
}

// POST /api/auth/logout
// Requires a token. Deletes the current session.
function logout(req, res) {
  db.deleteSession(req.token);
  return res.json({ message: 'Logged out.' });
}

// Middleware: attaches req.user and req.token, or returns 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer <token>' });
  }
  const session = db.findSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  const user = db.findUserById(session.user_id);
  if (!user) {
    db.deleteSession(token);
    return res.status(401).json({ error: 'Account no longer exists.' });
  }
  req.user = user;
  req.token = token;
  next();
}

// Middleware factory: only lets the given roles through (403 otherwise).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this action.' });
    }
    next();
  };
}

module.exports = { register, login, logout, requireAuth, requireRole };
