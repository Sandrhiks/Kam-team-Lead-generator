"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { setup } = require("../test-support/helpers");

const t = setup({ API_KEY: "secret-key", ALLOWED_ORIGINS: "https://partner.example", ALLOWED_EMAILS: "boss@kam.test,@team.test" });
let cookie;

before(async () => {
  await t.start();
  const r = await t.signup("Boss@Kam.test", "correct horse", "Sandy");
  assert.strictEqual(r.status, 201);
  cookie = t.cookieOf(r);
});
after(() => t.stop());

/* ---------------- Gate ---------------- */
test("signed-out visitors are sent to the sign-in page", async () => {
  for (const p of ["/", "/index.html"]) {
    const r = await t.req(p);
    assert.strictEqual(r.status, 302, p);
    assert.strictEqual(r.headers.get("location"), "/login");
  }
  const login = await t.req("/login");
  assert.strictEqual(login.status, 200);
  assert.match(await login.text(), /Create account/);
  assert.strictEqual((await t.req("/kam-team-logo.png")).status, 200);
});

test("signed-in users get the app, and /login sends them back to it", async () => {
  const r = await t.req("/", { cookie });
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Lead Generator/);
  const login = await t.req("/login", { cookie });
  assert.strictEqual(login.status, 302);
  assert.strictEqual(login.headers.get("location"), "/");
});

test("a tampered or expired cookie is rejected", async () => {
  const [data, sig] = cookie.split("=")[1].split(".");
  const forged = JSON.parse(Buffer.from(data, "base64url"));
  forged.e = "someone@else.test";
  const bad = "kt_session=" + Buffer.from(JSON.stringify(forged)).toString("base64url") + "." + sig;
  assert.strictEqual((await t.req("/", { cookie: bad })).status, 302);
  assert.strictEqual((await t.req("/", { cookie: "kt_session=garbage" })).status, 302);
});

test("health stays public and doesn't leak the webhook URL", async () => {
  const j = await (await t.req("/api/health")).json();
  assert.deepStrictEqual(j, { ok: true, relay: true, apiKeyRequired: true });
});

test("blocks path traversal", async () => {
  const r = await new Promise(res => http.get(t.base + "/..%2fserver.js", { headers: { Cookie: cookie } }, res));
  assert.notStrictEqual(r.statusCode, 200);
});

/* ---------------- Accounts ---------------- */
test("sign-up only accepts approved emails and domains", async () => {
  assert.strictEqual((await t.signup("stranger@gmail.com")).status, 403);
  assert.strictEqual((await t.signup("agent@team.test")).status, 201);
});

test("sign-up validates input and rejects duplicates", async () => {
  assert.strictEqual((await t.signup("boss@kam.test")).status, 409);
  assert.strictEqual((await t.signup("new@team.test", "short")).status, 400);
  assert.strictEqual((await t.signup("not-an-email")).status, 400);
});

test("passwords are stored hashed, never in plain text", () => {
  const stored = fs.readFileSync(path.join(t.dataDir, "users.json"), "utf8");
  assert.doesNotMatch(stored, /correct horse/);
  assert.match(JSON.parse(stored)["boss@kam.test"].hash, /^scrypt\$/);
});

test("sign-in checks the password", async () => {
  const wrong = await t.req("/auth/login", { method: "POST", body: { email: "boss@kam.test", password: "nope nope" } });
  assert.strictEqual(wrong.status, 401);
  const unknown = await t.req("/auth/login", { method: "POST", body: { email: "ghost@kam.test", password: "whatever1" } });
  assert.strictEqual(unknown.status, 401);
  assert.deepStrictEqual(await wrong.json(), await unknown.json());

  const ok = await t.req("/auth/login", { method: "POST", body: { email: " BOSS@kam.test ", password: "correct horse" } });
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers.get("set-cookie"), /HttpOnly/);
  const me = await (await t.req("/auth/me", { cookie: t.cookieOf(ok) })).json();
  assert.deepStrictEqual(me, { ok: true, email: "boss@kam.test", name: "Sandy" });
});

test("auth endpoints refuse cross-site posts", async () => {
  const r = await t.req("/auth/login", { method: "POST", body: { email: "boss@kam.test", password: "correct horse" }, headers: { Origin: "https://evil.example" } });
  assert.strictEqual(r.status, 403);
});

test("sign-out clears the cookie", async () => {
  const r = await t.req("/auth/logout", { method: "POST", cookie });
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
});

/* ---------------- Relay ---------------- */
test("relay needs a signed-in user or the API key", async () => {
  assert.strictEqual((await t.req("/api/ghl", { method: "POST", body: { a: 1 } })).status, 401);
  assert.strictEqual((await t.req("/api/ghl", { method: "POST", body: { a: 1 }, headers: { "X-API-Key": "nope" } })).status, 401);
  assert.strictEqual((await t.req("/api/ghl", { method: "POST", body: { a: 1 }, headers: { "X-API-Key": "secret-key" } })).status, 200);
});

test("forwards a signed-in user's lead to GHL", async () => {
  t.ghl.received.length = 0;
  const r = await t.req("/api/ghl", { method: "POST", body: { lead_id: "L1", full_name: "Jane" }, cookie });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(t.ghl.received, [{ url: "https://ghl.test/hooks/abc", body: { lead_id: "L1", full_name: "Jane" } }]);
});

test("reports GHL errors as 502", async () => {
  t.ghl.status = 500;
  const r = await t.req("/api/ghl", { method: "POST", body: { lead_id: "L2" }, cookie });
  t.ghl.status = 200;
  assert.strictEqual(r.status, 502);
});

test("rejects invalid JSON and oversized bodies", async () => {
  assert.strictEqual((await t.req("/api/ghl", { method: "POST", body: "not json", cookie })).status, 400);
  assert.strictEqual((await t.req("/api/ghl", { method: "POST", body: "[1,2]", cookie })).status, 400);
  const big = JSON.stringify({ x: "a".repeat(70 * 1024) });
  const r = await t.req("/api/ghl", { method: "POST", body: big, cookie }).catch(() => ({ status: 413 }));
  assert.strictEqual(r.status, 413);
});

test("enforces allowed origins on the relay", async () => {
  const headers = { "X-API-Key": "secret-key" };
  const bad = await t.req("/api/ghl", { method: "POST", body: { a: 1 }, headers: { ...headers, Origin: "https://evil.example" } });
  assert.strictEqual(bad.status, 403);
  const ok = await t.req("/api/ghl", { method: "POST", body: { a: 1 }, headers: { ...headers, Origin: "https://partner.example" } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.headers.get("access-control-allow-origin"), "https://partner.example");
});
