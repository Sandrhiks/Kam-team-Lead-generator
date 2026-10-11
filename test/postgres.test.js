"use strict";

// Runs only when TEST_DATABASE_URL points at a disposable Postgres database.
const { test } = require("node:test");
const assert = require("node:assert");

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "set TEST_DATABASE_URL to run";

test("Postgres account store", { skip }, async t2 => {
  const { Client } = require("pg");
  const db = new Client({ connectionString: url });
  await db.connect();
  await db.query("DROP TABLE IF EXISTS kam_users");
  await db.query("DROP TABLE IF EXISTS kam_leads");
  const { setup } = require("../test-support/helpers");
  const t = setup({ ALLOWED_EMAILS: "@kam.test", DATABASE_URL: url });
  await t.start();

  try {
    await t2.test("sign up, duplicate, sign in", async () => {
      assert.strictEqual((await t.signup("pg@kam.test", "correct horse")).status, 201);
      assert.strictEqual((await t.signup("pg@kam.test", "correct horse")).status, 409);
      const ok = await t.req("/auth/login", { method: "POST", body: { email: "pg@kam.test", password: "correct horse" } });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual((await t.req("/", { cookie: t.cookieOf(ok) })).status, 200);
      const row = (await db.query("SELECT hash FROM kam_users WHERE email = 'pg@kam.test'")).rows[0];
      assert.match(row.hash, /^scrypt\$/);
    });
    await t2.test("leads: save, newer wins, tombstones, per-user", async () => {
      const cookie = t.cookieOf(await t.req("/auth/login", { method: "POST", body: { email: "pg@kam.test", password: "correct horse" } }));
      const other = t.cookieOf(await t.signup("other@kam.test", "correct horse"));
      const sync = (c, body) => t.req("/api/leads/sync", { method: "POST", body, cookie: c }).then(r => r.json());
      const list = c => t.req("/api/leads", { cookie: c }).then(r => r.json()).then(j => j.leads);
      assert.deepStrictEqual(await sync(cookie, { upsert: [{ id: "A", updated: 10, name: "A" }, { id: "B", updated: 10, name: "B" }] }), { ok: true, saved: 2, skipped: 0 });
      assert.strictEqual((await sync(cookie, { upsert: [{ id: "A", updated: 5, name: "old" }] })).skipped, 1);
      await sync(cookie, { upsert: [{ id: "A", updated: 20, name: "A2" }], delete: ["B"] });
      const rows = await list(cookie);
      assert.strictEqual(rows.find(l => l.id === "A").name, "A2");
      assert.strictEqual(rows.find(l => l.id === "B").deleted, true);
      assert.deepStrictEqual(await list(other), []);
    });
  } finally {
    await db.query("DROP TABLE IF EXISTS kam_users");
    await db.query("DROP TABLE IF EXISTS kam_leads");
    await db.end();
    await t.stop();
  }
});
