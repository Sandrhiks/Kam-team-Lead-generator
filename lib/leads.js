"use strict";

// Each user's leads, saved on the server so they follow the user across devices.
// A lead is stored as its JSON object plus an `updated` time; the newer copy wins.
// Deleting leaves a tombstone ({ id, deleted: true, updated }) so a stale copy on
// another device can't bring the lead back.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_LEADS_PER_USER = 10000;
const MAX_LEAD_BYTES = 64 * 1024;

/* ---------------- Validation ---------------- */
// Returns a clean { id, updated, data } record, or an error string.
function checkLead(lead) {
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) return "lead must be an object";
  if (typeof lead.id !== "string" || !/^[\w-]{1,64}$/.test(lead.id)) return "lead id is missing or invalid";
  const updated = Number(lead.updated || lead.created);
  if (!Number.isFinite(updated) || updated <= 0) return `lead ${lead.id} has no valid updated time`;
  if (Buffer.byteLength(JSON.stringify(lead)) > MAX_LEAD_BYTES) return `lead ${lead.id} is too large`;
  return { id: lead.id, updated, data: { ...lead, updated } };
}

/* ---------------- File store ---------------- */
function fileStore(dir) {
  const folder = path.join(dir, "leads");
  const cache = new Map();
  let queue = Promise.resolve();
  const locked = fn => (queue = queue.then(fn, fn));
  const fileFor = owner => path.join(folder, crypto.createHash("sha256").update(owner).digest("hex").slice(0, 32) + ".json");

  function load(owner) {
    if (!cache.has(owner)) {
      let rows = {};
      try { rows = JSON.parse(fs.readFileSync(fileFor(owner), "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
      cache.set(owner, rows);
    }
    return cache.get(owner);
  }

  function save(owner) {
    fs.mkdirSync(folder, { recursive: true });
    const file = fileFor(owner), tmp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache.get(owner)), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  return {
    async init() {},
    async list(owner) { return Object.values(load(owner)); },
    apply(owner, upserts, deletes, now) {
      return locked(() => {
        const rows = load(owner);
        let saved = 0, skipped = 0;
        for (const r of upserts) {
          const cur = rows[r.id];
          if (cur && cur.updated > r.updated) { skipped++; continue; }
          if (!cur && Object.keys(rows).length >= MAX_LEADS_PER_USER) {
            throw Object.assign(new Error(`You can store up to ${MAX_LEADS_PER_USER} leads.`), { status: 413 });
          }
          rows[r.id] = r.data; saved++;
        }
        for (const id of deletes) { rows[id] = { id, deleted: true, updated: now }; saved++; }
        if (saved) save(owner);
        return { saved, skipped };
      });
    },
  };
}

/* ---------------- Postgres store ---------------- */
function pgStore(url) {
  const pool = require("./db").getPool(url);
  return {
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS kam_leads (
        owner TEXT NOT NULL, id TEXT NOT NULL, updated BIGINT NOT NULL, data JSONB NOT NULL,
        PRIMARY KEY (owner, id))`);
    },
    async list(owner) {
      const r = await pool.query("SELECT data FROM kam_leads WHERE owner = $1", [owner]);
      return r.rows.map(x => x.data);
    },
    async apply(owner, upserts, deletes, now) {
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const { rows: [{ n }] } = await db.query("SELECT COUNT(*)::int AS n FROM kam_leads WHERE owner = $1", [owner]);
        let count = n, saved = 0, skipped = 0;
        for (const r of upserts) {
          // Insert, or overwrite only when this copy is at least as new as the stored one.
          const res = await db.query(
            `INSERT INTO kam_leads (owner, id, updated, data) VALUES ($1, $2, $3, $4)
             ON CONFLICT (owner, id) DO UPDATE SET updated = EXCLUDED.updated, data = EXCLUDED.data
             WHERE kam_leads.updated <= EXCLUDED.updated
             RETURNING (xmax = 0) AS inserted`,
            [owner, r.id, r.updated, r.data]);
          if (!res.rowCount) { skipped++; continue; }
          if (res.rows[0].inserted && ++count > MAX_LEADS_PER_USER) {
            throw Object.assign(new Error(`You can store up to ${MAX_LEADS_PER_USER} leads.`), { status: 413 });
          }
          saved++;
        }
        for (const id of deletes) {
          await db.query(
            `INSERT INTO kam_leads (owner, id, updated, data) VALUES ($1, $2, $3, $4)
             ON CONFLICT (owner, id) DO UPDATE SET updated = EXCLUDED.updated, data = EXCLUDED.data`,
            [owner, id, now, { id, deleted: true, updated: now }]);
          saved++;
        }
        await db.query("COMMIT");
        return { saved, skipped };
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        db.release();
      }
    },
  };
}

function createLeadStore({ databaseUrl, dataDir }) {
  return databaseUrl ? pgStore(databaseUrl) : fileStore(dataDir);
}

module.exports = { createLeadStore, checkLead, MAX_LEADS_PER_USER };
