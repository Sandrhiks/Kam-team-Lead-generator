"use strict";

// Storage for the Graphic Designer AI. Two interchangeable backends:
// - Postgres when DATABASE_URL is set (survives redeploys on any host)
// - JSON files in DATA_DIR otherwise (needs a persistent disk in production)
//
// Three kinds of records:
// - users:  { email, name, created, lastLogin, sv }   (sv = session version; bumping it signs out every device)
// - codes:  one pending sign-in code per email { email, hash, exp, tries, sent }
// - docs:   everything a user owns (designs, chats, tickets), keyed by (owner, kind, id)

const fs = require("node:fs");
const path = require("node:path");

const KINDS = new Set(["design", "chat", "ticket"]);

/* ---------------- File store ---------------- */
function fileStore(dir) {
  const file = name => path.join(dir, name + ".json");
  const cache = {};
  let queue = Promise.resolve();
  const locked = fn => (queue = queue.then(fn, fn));

  function load(name) {
    if (!cache[name]) {
      try { cache[name] = JSON.parse(fs.readFileSync(file(name), "utf8")); } catch (e) {
        if (e.code !== "ENOENT") throw e;
        cache[name] = {};
      }
    }
    return cache[name];
  }
  function save(name) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file(name) + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache[name]), { mode: 0o600 });
    fs.renameSync(tmp, file(name));
  }
  const docKey = (owner, kind, id) => `${owner}\u0000${kind}\u0000${id}`;

  return {
    kind: "file (" + dir + ")",
    async init() { load("users"); load("codes"); load("docs"); },

    async getUser(email) { return load("users")[email] || null; },
    async countUsers() { return Object.keys(load("users")).length; },
    putUser(user) { return locked(() => { load("users")[user.email] = user; save("users"); }); },

    async getCode(email) { return load("codes")[email] || null; },
    putCode(rec) { return locked(() => { load("codes")[rec.email] = rec; save("codes"); }); },
    deleteCode(email) { return locked(() => { delete load("codes")[email]; save("codes"); }); },

    async listDocs(owner, kind) {
      const prefix = docKey(owner, kind, "");
      return Object.entries(load("docs")).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
    },
    async getDoc(owner, kind, id) { return load("docs")[docKey(owner, kind, id)] || null; },
    putDoc(owner, kind, doc) { return locked(() => { load("docs")[docKey(owner, kind, doc.id)] = doc; save("docs"); }); },
    deleteDoc(owner, kind, id) {
      return locked(() => {
        const docs = load("docs"), k = docKey(owner, kind, id);
        const had = k in docs;
        delete docs[k];
        if (had) save("docs");
        return had;
      });
    },
    async countDocs(owner, kind) { return (await this.listDocs(owner, kind)).length; },
  };
}

/* ---------------- Postgres store ---------------- */
function pgStore(url) {
  const { Pool } = require("pg");
  // Managed databases need SSL; local ones and "?sslmode=disable" URLs don't.
  const noSsl = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /[?&]sslmode=disable\b/.test(url);
  const pool = new Pool({ connectionString: url, ssl: noSsl ? false : { rejectUnauthorized: false }, max: 5 });

  return {
    kind: "postgres",
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS studio_users (email TEXT PRIMARY KEY, data JSONB NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS studio_codes (email TEXT PRIMARY KEY, data JSONB NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS studio_docs (
        owner TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated BIGINT NOT NULL, data JSONB NOT NULL,
        PRIMARY KEY (owner, kind, id))`);
    },

    async getUser(email) { return (await pool.query("SELECT data FROM studio_users WHERE email = $1", [email])).rows[0]?.data || null; },
    async countUsers() { return (await pool.query("SELECT COUNT(*)::int AS n FROM studio_users")).rows[0].n; },
    async putUser(user) {
      await pool.query(`INSERT INTO studio_users (email, data) VALUES ($1, $2)
        ON CONFLICT (email) DO UPDATE SET data = EXCLUDED.data`, [user.email, user]);
    },

    async getCode(email) { return (await pool.query("SELECT data FROM studio_codes WHERE email = $1", [email])).rows[0]?.data || null; },
    async putCode(rec) {
      await pool.query(`INSERT INTO studio_codes (email, data) VALUES ($1, $2)
        ON CONFLICT (email) DO UPDATE SET data = EXCLUDED.data`, [rec.email, rec]);
    },
    async deleteCode(email) { await pool.query("DELETE FROM studio_codes WHERE email = $1", [email]); },

    async listDocs(owner, kind) {
      return (await pool.query("SELECT data FROM studio_docs WHERE owner = $1 AND kind = $2", [owner, kind])).rows.map(r => r.data);
    },
    async getDoc(owner, kind, id) {
      return (await pool.query("SELECT data FROM studio_docs WHERE owner = $1 AND kind = $2 AND id = $3", [owner, kind, id])).rows[0]?.data || null;
    },
    async putDoc(owner, kind, doc) {
      await pool.query(`INSERT INTO studio_docs (owner, kind, id, updated, data) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (owner, kind, id) DO UPDATE SET updated = EXCLUDED.updated, data = EXCLUDED.data`,
      [owner, kind, doc.id, doc.updated || Date.now(), doc]);
    },
    async deleteDoc(owner, kind, id) {
      return (await pool.query("DELETE FROM studio_docs WHERE owner = $1 AND kind = $2 AND id = $3", [owner, kind, id])).rowCount > 0;
    },
    async countDocs(owner, kind) {
      return (await pool.query("SELECT COUNT(*)::int AS n FROM studio_docs WHERE owner = $1 AND kind = $2", [owner, kind])).rows[0].n;
    },
  };
}

function createStore({ databaseUrl, dataDir }) {
  return databaseUrl ? pgStore(databaseUrl) : fileStore(dataDir);
}

module.exports = { createStore, KINDS };
