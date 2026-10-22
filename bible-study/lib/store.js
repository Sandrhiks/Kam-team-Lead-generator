"use strict";

// Each member's study progress (one JSON document per account) and their
// push subscriptions (one row per device). Postgres when DATABASE_URL is set,
// JSON files in DATA_DIR otherwise — the same split the lead generator uses.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_PROGRESS_BYTES = 2 * 1024 * 1024;
const MAX_DEVICES_PER_USER = 10;

/* ---------------- File store ---------------- */
function fileStore(dir) {
  const folder = path.join(dir, "progress");
  const subsFile = path.join(dir, "push-subscriptions.json");
  const cache = new Map();
  let subs = null;
  let queue = Promise.resolve();
  const locked = fn => (queue = queue.then(fn, fn));
  const fileFor = owner => path.join(folder, crypto.createHash("sha256").update(owner).digest("hex").slice(0, 32) + ".json");

  function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return fallback;
    }
  }

  function load(owner) {
    if (!cache.has(owner)) cache.set(owner, readJson(fileFor(owner), null));
    return cache.get(owner);
  }

  const loadSubs = () => (subs = subs || readJson(subsFile, {}));

  return {
    kind: "file (" + dir + ")",
    async init() {},
    async getProgress(owner) { return load(owner); },
    saveProgress(owner, data, updated) {
      return locked(() => {
        const cur = load(owner);
        if (cur && cur.updated > updated) return { saved: false, current: cur };
        const doc = { data, updated };
        cache.set(owner, doc);
        writeJson(fileFor(owner), doc);
        return { saved: true, current: doc };
      });
    },
    addSubscription(owner, sub) {
      return locked(() => {
        const all = loadSubs();
        all[sub.endpoint] = { email: owner, sub, created: Date.now() };
        const mine = Object.entries(all).filter(([, v]) => v.email === owner).sort((a, b) => a[1].created - b[1].created);
        while (mine.length > MAX_DEVICES_PER_USER) delete all[mine.shift()[0]];
        writeJson(subsFile, all);
      });
    },
    removeSubscription(endpoint, owner) {
      return locked(() => {
        const all = loadSubs();
        if (!all[endpoint] || (owner && all[endpoint].email !== owner)) return false;
        delete all[endpoint];
        writeJson(subsFile, all);
        return true;
      });
    },
    async listSubscriptions() {
      return Object.values(loadSubs()).map(v => ({ email: v.email, sub: v.sub }));
    },
    async countSubscriptions(owner) {
      return Object.values(loadSubs()).filter(v => v.email === owner).length;
    },
  };
}

/* ---------------- Postgres store ---------------- */
function pgStore(url) {
  const pool = require("../../lib/db").getPool(url);
  return {
    kind: "postgres",
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS bible_progress (
        email TEXT PRIMARY KEY, data JSONB NOT NULL, updated BIGINT NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS bible_push (
        endpoint TEXT PRIMARY KEY, email TEXT NOT NULL, sub JSONB NOT NULL, created BIGINT NOT NULL)`);
    },
    async getProgress(owner) {
      const r = await pool.query("SELECT data, updated FROM bible_progress WHERE email = $1", [owner]);
      return r.rows[0] ? { data: r.rows[0].data, updated: Number(r.rows[0].updated) } : null;
    },
    async saveProgress(owner, data, updated) {
      // Only overwrite when ours is at least as new as what's stored.
      const r = await pool.query(
        `INSERT INTO bible_progress (email, data, updated) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET data = EXCLUDED.data, updated = EXCLUDED.updated
         WHERE bible_progress.updated <= EXCLUDED.updated`, [owner, JSON.stringify(data), updated]);
      return { saved: r.rowCount === 1, current: await this.getProgress(owner) };
    },
    async addSubscription(owner, sub) {
      await pool.query(
        `INSERT INTO bible_push (endpoint, email, sub, created) VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET email = EXCLUDED.email, sub = EXCLUDED.sub`,
        [sub.endpoint, owner, JSON.stringify(sub), Date.now()]);
      await pool.query(
        `DELETE FROM bible_push WHERE email = $1 AND endpoint NOT IN
         (SELECT endpoint FROM bible_push WHERE email = $1 ORDER BY created DESC LIMIT $2)`, [owner, MAX_DEVICES_PER_USER]);
    },
    async removeSubscription(endpoint, owner) {
      const r = owner
        ? await pool.query("DELETE FROM bible_push WHERE endpoint = $1 AND email = $2", [endpoint, owner])
        : await pool.query("DELETE FROM bible_push WHERE endpoint = $1", [endpoint]);
      return r.rowCount === 1;
    },
    async listSubscriptions() {
      const r = await pool.query("SELECT email, sub FROM bible_push");
      return r.rows;
    },
    async countSubscriptions(owner) {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM bible_push WHERE email = $1", [owner]);
      return r.rows[0].n;
    },
  };
}

function createStore({ databaseUrl, dataDir }) {
  return databaseUrl ? pgStore(databaseUrl) : fileStore(dataDir);
}

module.exports = { createStore, MAX_PROGRESS_BYTES };
