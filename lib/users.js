"use strict";

// User accounts: password hashing plus two interchangeable stores.
// - Postgres when DATABASE_URL is set (survives redeploys on any host)
// - JSON file in DATA_DIR otherwise (needs a persistent disk in production)

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/* ---------------- Passwords ---------------- */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(key, expected);
}

// Used when the email is unknown, so a failed login takes as long as a wrong password.
let dummyHash;
async function burnPasswordCheck(password) {
  dummyHash = dummyHash || await hashPassword(crypto.randomBytes(16).toString("hex"));
  await verifyPassword(password, dummyHash);
}

// Short fingerprint of the password hash, stored in the session cookie so a
// password change signs out every existing session.
function passwordVersion(user) {
  return crypto.createHash("sha256").update(user.hash).digest("base64url").slice(0, 16);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ---------------- File store ---------------- */
function fileStore(dir) {
  const file = path.join(dir, "users.json");
  let cache = null;
  let queue = Promise.resolve();

  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {
      if (e.code !== "ENOENT") throw e;
      cache = {};
    }
    return cache;
  }

  function save() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  // Serialize writes so two sign-ups at once can't clobber each other.
  const locked = fn => (queue = queue.then(fn, fn));

  return {
    kind: "file (" + file + ")",
    async init() { load(); },
    async get(email) { return load()[email] || null; },
    async count() { return Object.keys(load()).length; },
    create(user) {
      return locked(() => {
        const users = load();
        if (users[user.email]) return false;
        users[user.email] = user;
        save();
        return true;
      });
    },
  };
}

/* ---------------- Postgres store ---------------- */
function pgStore(url) {
  const { Pool } = require("pg");
  // Managed databases need SSL; local ones and "?sslmode=disable" URLs don't.
  const noSsl = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /[?&]sslmode=disable\b/.test(url);
  const pool = new Pool({ connectionString: url, ssl: noSsl ? false : { rejectUnauthorized: false }, max: 5 });
  const row = r => r && { email: r.email, name: r.name, hash: r.hash, created: Number(r.created) };

  return {
    kind: "postgres",
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS kam_users (
        email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL, created BIGINT NOT NULL)`);
    },
    async get(email) {
      const r = await pool.query("SELECT * FROM kam_users WHERE email = $1", [email]);
      return row(r.rows[0]);
    },
    async count() {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM kam_users");
      return r.rows[0].n;
    },
    async create(user) {
      const r = await pool.query(
        "INSERT INTO kam_users (email, name, hash, created) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING",
        [user.email, user.name, user.hash, user.created]);
      return r.rowCount === 1;
    },
  };
}

function createStore({ databaseUrl, dataDir }) {
  return databaseUrl ? pgStore(databaseUrl) : fileStore(dataDir);
}

module.exports = {
  createStore, hashPassword, verifyPassword, burnPasswordCheck, passwordVersion, normalizeEmail, validEmail,
};
