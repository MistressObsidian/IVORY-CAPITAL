require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const schemaPath = path.join(rootDir, 'database', 'schema.sql');

const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000
});

async function ensureSchema() {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
}

function publicUser(record) {
  return {
    id: record.id,
    firstName: record.first_name,
    lastName: record.last_name,
    email: record.email,
    country: record.country,
    createdAt: record.created_at
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(function allowCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/api/health', async function health(req, res) {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, database: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Database connection failed.' });
  }
});

app.post('/api/auth/register', async function register(req, res) {
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const country = String(req.body.country || '').trim();

  if (!firstName || !lastName || !email || !password) {
    res.status(400).json({ ok: false, message: 'First name, last name, email, and password are required.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ ok: false, message: 'Password must be at least 6 characters long.' });
    return;
  }

  try {
    const existing = await pool.query('SELECT id FROM public.ivory_users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      res.status(409).json({ ok: false, message: 'An account with that email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      'INSERT INTO public.ivory_users (first_name, last_name, email, country, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, country, created_at',
      [firstName, lastName, email, country || null, passwordHash]
    );

    res.status(201).json({
      ok: true,
      message: 'Account created successfully.',
      redirectTo: 'http://127.0.0.1:' + port + '/server/dashboard/',
      user: publicUser(insert.rows[0])
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ ok: false, message: 'Unable to create account right now.' });
  }
});

app.post('/api/auth/login', async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    res.status(400).json({ ok: false, message: 'Email and password are required.' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM public.ivory_users WHERE email = $1', [email]);
    if (result.rowCount === 0) {
      res.status(401).json({ ok: false, message: 'Invalid email or password.' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ ok: false, message: 'Invalid email or password.' });
      return;
    }

    res.json({
      ok: true,
      message: 'Login successful.',
      redirectTo: 'http://127.0.0.1:' + port + '/server/dashboard/',
      user: publicUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ ok: false, message: 'Unable to login right now.' });
  }
});

app.use(express.static(rootDir, { extensions: ['html'] }));

app.get('*', function fallback(req, res) {
  const notFoundFile = path.join(rootDir, 'index.html');
  res.sendFile(notFoundFile);
});

ensureSchema()
  .then(function onReady() {
    app.listen(port, function onListen() {
      console.log('Ivory Capital server listening on http://127.0.0.1:' + port);
    });
  })
  .catch(function onError(error) {
    console.error('Server failed to start:', error);
    process.exit(1);
  });
