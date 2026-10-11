"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { setup } = require("../test-support/helpers");

const t = setup({ ALLOWED_EMAILS: "*" });
let alice, bob;

before(async () => {
  await t.start();
  alice = t.cookieOf(await t.signup("alice@kam.test"));
  bob = t.cookieOf(await t.signup("bob@kam.test"));
});
after(() => t.stop());

const sync = (cookie, body) => t.req("/api/leads/sync", { method: "POST", body, cookie });
const list = async cookie => (await (await t.req("/api/leads", { cookie })).json()).leads;
const lead = (id, updated, extra = {}) => ({ id, name: "Lead " + id, type: "seller", status: "New", updated, activity: [], ...extra });

test("leads need a signed-in user", async () => {
  assert.strictEqual((await t.req("/api/leads")).status, 401);
  assert.strictEqual((await sync(null, { upsert: [lead("L1", 1)] })).status, 401);
});

test("saves leads per user and keeps them private", async () => {
  const r = await sync(alice, { upsert: [lead("L1", 100), lead("L2", 100)] });
  assert.deepStrictEqual(await r.json(), { ok: true, saved: 2, skipped: 0 });
  assert.deepStrictEqual((await list(alice)).map(l => l.id).sort(), ["L1", "L2"]);
  assert.deepStrictEqual(await list(bob), []);
});

test("the newer copy wins", async () => {
  await sync(alice, { upsert: [lead("L1", 200, { status: "Contacted" })] });
  const r = await sync(alice, { upsert: [lead("L1", 150, { status: "Closed" })] });
  assert.strictEqual((await r.json()).skipped, 1);
  assert.strictEqual((await list(alice)).find(l => l.id === "L1").status, "Contacted");
});

test("deleting leaves a tombstone so other devices drop the lead", async () => {
  await sync(alice, { delete: ["L2"] });
  const l2 = (await list(alice)).find(l => l.id === "L2");
  assert.strictEqual(l2.deleted, true);
  assert.ok(l2.updated > 0);
});

test("contact history is saved with the lead", async () => {
  const activity = [{ at: 300, text: "Call · Connected: wants a CMA", kind: "call", outcome: "Connected", by: "Alice" }];
  await sync(alice, { upsert: [lead("L3", 300, { activity })] });
  assert.deepStrictEqual((await list(alice)).find(l => l.id === "L3").activity, activity);
});

test("rejects bad input", async () => {
  assert.strictEqual((await sync(alice, { upsert: [{ id: "../x", updated: 1 }] })).status, 400);
  assert.strictEqual((await sync(alice, { upsert: [{ id: "L9" }] })).status, 400);
  assert.strictEqual((await sync(alice, { delete: [42] })).status, 400);
  const big = lead("L9", 1, { notes: "x".repeat(70 * 1024) });
  assert.strictEqual((await sync(alice, { upsert: [big] })).status, 400);
  const cross = await t.req("/api/leads/sync", { method: "POST", body: { upsert: [] }, cookie: alice, headers: { Origin: "https://evil.example" } });
  assert.strictEqual(cross.status, 403);
});
