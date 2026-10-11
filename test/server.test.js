"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

// The relay only accepts https upstreams, so tests point it at a local https-looking
// URL and intercept the outbound call by stubbing global fetch.
process.env.GHL_WEBHOOK_URL = "https://ghl.test/hooks/abc";
process.env.API_KEY = "secret-key";
process.env.ALLOWED_ORIGINS = "https://partner.example";

const received = [];
let upstreamStatus = 200;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://ghl.test/")) {
    received.push({ url, body: JSON.parse(opts.body) });
    return new Response("{}", { status: upstreamStatus });
  }
  return realFetch(url, opts);
};

const server = require("../server.js");
let base;

before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise(r => server.close(r)));

function post(path, body, headers = {}) {
  return realFetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("health reports relay status without leaking the URL", async () => {
  const r = await realFetch(base + "/api/health");
  const j = await r.json();
  assert.deepStrictEqual(j, { ok: true, relay: true, apiKeyRequired: true });
});

test("serves the app", async () => {
  const r = await realFetch(base + "/");
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Kam Team/);
});

test("blocks path traversal", async () => {
  const r = await new Promise(res => http.get(base + "/..%2fserver.js", res));
  assert.notStrictEqual(r.statusCode, 200);
});

test("rejects a missing or wrong API key", async () => {
  assert.strictEqual((await post("/api/ghl", { a: 1 })).status, 401);
  assert.strictEqual((await post("/api/ghl", { a: 1 }, { "X-API-Key": "nope" })).status, 401);
});

test("forwards a lead to GHL", async () => {
  received.length = 0;
  const r = await post("/api/ghl", { lead_id: "L1", full_name: "Jane" }, { "X-API-Key": "secret-key" });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(received, [{ url: "https://ghl.test/hooks/abc", body: { lead_id: "L1", full_name: "Jane" } }]);
});

test("reports GHL errors as 502", async () => {
  upstreamStatus = 500;
  const r = await post("/api/ghl", { lead_id: "L2" }, { "X-API-Key": "secret-key" });
  upstreamStatus = 200;
  assert.strictEqual(r.status, 502);
});

test("rejects invalid JSON and oversized bodies", async () => {
  assert.strictEqual((await post("/api/ghl", "not json", { "X-API-Key": "secret-key" })).status, 400);
  assert.strictEqual((await post("/api/ghl", [1, 2], { "X-API-Key": "secret-key" })).status, 400);
  const big = JSON.stringify({ x: "a".repeat(70 * 1024) });
  const r = await post("/api/ghl", big, { "X-API-Key": "secret-key" }).catch(() => ({ status: 413 }));
  assert.strictEqual(r.status, 413);
});

test("enforces allowed origins", async () => {
  const bad = await post("/api/ghl", { a: 1 }, { "X-API-Key": "secret-key", Origin: "https://evil.example" });
  assert.strictEqual(bad.status, 403);
  const ok = await post("/api/ghl", { a: 1 }, { "X-API-Key": "secret-key", Origin: "https://partner.example" });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.headers.get("access-control-allow-origin"), "https://partner.example");
});
