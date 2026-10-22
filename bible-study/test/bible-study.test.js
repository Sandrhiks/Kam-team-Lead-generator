"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kbs-test-"));
Object.assign(process.env, { SESSION_SECRET: "test-secret", DATA_DIR: dataDir, DATABASE_URL: "", ALLOWED_EMAILS: "*" });

// Capture outbound pushes instead of sending them.
const pushed = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://push.test/")) {
    pushed.push({ url: String(url), headers: opts.headers, body: opts.body });
    return new Response("", { status: String(url).includes("/gone") ? 410 : 201 });
  }
  return realFetch(url, opts);
};

const server = require("../server.js");
const push = require("../lib/push");
const { dueReminders, localParts } = require("../lib/reminders");
let base, cookie;

const req = (p, { method = "GET", body, cookie: c } = {}) => realFetch(base + p, {
  method, redirect: "manual",
  headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(c ? { Cookie: c } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const cookieOf = r => (r.headers.get("set-cookie") || "").split(";")[0];

function fakeSubscription(endpoint) {
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } } };
}

before(async () => {
  await server.ready;
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await req("/auth/signup", { method: "POST", body: { email: "Member@Church.test", password: "faith hope love", name: "Ana Cruz" } });
  assert.strictEqual(r.status, 201);
  cookie = cookieOf(r);
});
after(() => new Promise(r => server.close(r)));

/* ---------------- Sign-in gate ---------------- */
test("signed-out visitors get the sign-in page; its assets stay public", async () => {
  const home = await req("/");
  assert.strictEqual(home.status, 302);
  assert.strictEqual(home.headers.get("location"), "/login");
  const login = await req("/login");
  assert.strictEqual(login.status, 200);
  const html = await login.text();
  assert.match(html, /Create account/);
  assert.match(html, /Kam Team Publishing/);
  assert.match(html, /Arty Incognito/);
  assert.match(html, /Sandrhiks Builder/);
  for (const p of ["/styles.css", "/sw.js", "/manifest.webmanifest", "/icon.svg"]) assert.strictEqual((await req(p)).status, 200, p);
  assert.strictEqual((await req("/app.js")).status, 401);
  assert.strictEqual((await req("/api/progress")).status, 401);
});

test("sign in, see the app, sign out", async () => {
  const bad = await req("/auth/login", { method: "POST", body: { email: "member@church.test", password: "wrong password" } });
  assert.strictEqual(bad.status, 401);
  const ok = await req("/auth/login", { method: "POST", body: { email: "member@church.test", password: "faith hope love" } });
  assert.strictEqual(ok.status, 200);
  const c = cookieOf(ok);
  const app = await req("/", { cookie: c });
  assert.strictEqual(app.status, 200);
  assert.match(await app.text(), /Bible Study Guide/);
  const me = await (await req("/auth/me", { cookie: c })).json();
  assert.deepStrictEqual(me, { ok: true, email: "member@church.test", name: "Ana Cruz" });
  const out = await req("/auth/logout", { method: "POST", cookie: c });
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});

test("duplicate sign-up and short passwords are refused", async () => {
  assert.strictEqual((await req("/auth/signup", { method: "POST", body: { email: "member@church.test", password: "another pass" } })).status, 409);
  assert.strictEqual((await req("/auth/signup", { method: "POST", body: { email: "new@church.test", password: "short" } })).status, 400);
});

/* ---------------- Progress sync ---------------- */
test("progress saves, and an older copy can't overwrite a newer one", async () => {
  const empty = await (await req("/api/progress", { cookie })).json();
  assert.deepStrictEqual(empty, { ok: true, data: null, updated: 0 });

  const t1 = Date.now();
  const put = await req("/api/progress", { method: "PUT", cookie, body: { data: { lessons: { "life-1": { done: t1 } } }, updated: t1 } });
  assert.strictEqual(put.status, 200);

  const stale = await req("/api/progress", { method: "PUT", cookie, body: { data: { lessons: {} }, updated: t1 - 1000 } });
  assert.strictEqual(stale.status, 409);
  const j = await stale.json();
  assert.strictEqual(j.updated, t1);
  assert.ok(j.data.lessons["life-1"]);

  const back = await (await req("/api/progress", { cookie })).json();
  assert.strictEqual(back.updated, t1);
});

test("progress rejects bad bodies", async () => {
  assert.strictEqual((await req("/api/progress", { method: "PUT", cookie, body: { data: [], updated: Date.now() } })).status, 400);
  assert.strictEqual((await req("/api/progress", { method: "PUT", cookie, body: { data: {}, updated: "soon" } })).status, 400);
});

/* ---------------- Push ---------------- */
test("payload encryption round-trips (RFC 8291)", () => {
  const { ecdh, auth, sub } = fakeSubscription("https://push.test/a");
  const record = push.encrypt(sub, JSON.stringify({ title: "Hi" }));
  assert.strictEqual(push.decrypt(ecdh, auth, record), '{"title":"Hi"}');
});

test("VAPID header is a valid ES256 JWT for the push service origin", () => {
  const h = push.vapidHeader(server.vapid, "https://push.test/abc", "mailto:test@example.com");
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m, h);
  const claims = JSON.parse(Buffer.from(m[2], "base64url"));
  assert.strictEqual(claims.aud, "https://push.test");
  const pub = Buffer.from(m[4], "base64url");
  const key = crypto.createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") } });
  assert.ok(crypto.verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url")));
});

test("subscribing a device, test push, and the reminder scheduler", async () => {
  const key = await (await req("/api/push/key", { cookie })).json();
  assert.strictEqual(key.publicKey, server.vapid.publicKey);

  assert.strictEqual((await req("/api/push/subscribe", { method: "POST", cookie, body: { subscription: { endpoint: "http://insecure.test" } } })).status, 400);
  const dev = fakeSubscription("https://push.test/device-1");
  assert.strictEqual((await req("/api/push/subscribe", { method: "POST", cookie, body: { subscription: dev.sub } })).status, 200);

  pushed.length = 0;
  const t = await req("/api/push/test", { method: "POST", cookie, body: {} });
  assert.strictEqual(t.status, 200);
  assert.strictEqual(pushed.length, 1);
  assert.strictEqual(pushed[0].headers["Content-Encoding"], "aes128gcm");
  assert.match(push.decrypt(dev.ecdh, dev.auth, pushed[0].body), /Reminders are on/);

  // Save settings with a daily reminder at 06:30 Manila time, then tick at that minute.
  const updated = Date.now() + 1000;
  const data = {
    settings: { tz: "Asia/Manila", reminders: { daily: { on: true, time: "06:30", days: [] } } },
    log: {}, next: { reading: "John 3", lesson: "LC 2 · Assurance of Salvation" },
  };
  assert.strictEqual((await req("/api/progress", { method: "PUT", cookie, body: { data, updated } })).status, 200);
  const at = new Date("2026-10-22T22:30:00Z"); // 06:30 on Oct 23 in Manila
  pushed.length = 0;
  assert.strictEqual(await server.tick(at), 1);
  assert.match(push.decrypt(dev.ecdh, dev.auth, pushed[0].body), /John 3/);
  assert.strictEqual(await server.tick(at), 0, "same reminder isn't sent twice");

  // A dead subscription is removed when the push service says it's gone.
  const gone = fakeSubscription("https://push.test/gone");
  await req("/api/push/subscribe", { method: "POST", cookie, body: { subscription: gone.sub } });
  await req("/api/push/test", { method: "POST", cookie, body: {} });
  const subs = JSON.parse(fs.readFileSync(path.join(dataDir, "push-subscriptions.json"), "utf8"));
  assert.deepStrictEqual(Object.keys(subs), ["https://push.test/device-1"]);

  // Unsubscribe on sign-out.
  await req("/api/push/unsubscribe", { method: "POST", cookie, body: { endpoint: "https://push.test/device-1" } });
  assert.strictEqual((await req("/api/push/test", { method: "POST", cookie, body: {} })).status, 404);
});

/* ---------------- Reminder rules ---------------- */
test("daily reminder respects time, days and today's reading", () => {
  const now = new Date("2026-10-22T22:30:00Z"); // Fri 06:30 in Manila
  assert.deepStrictEqual(localParts(now, "Asia/Manila"), { date: "2026-10-23", time: "06:30", weekday: 5 });
  const data = d => ({ settings: { tz: "Asia/Manila", reminders: { daily: Object.assign({ on: true, time: "06:30", days: [] }, d) } }, log: {}, next: {} });

  assert.strictEqual(dueReminders(data({}), now).length, 1);
  assert.strictEqual(dueReminders(data({ time: "06:31" }), now).length, 0);
  assert.strictEqual(dueReminders(data({ days: [0, 6] }), now).length, 0);
  assert.strictEqual(dueReminders(data({ on: false }), now).length, 0);
  const read = data({}); read.log["2026-10-23"] = { read: true };
  assert.strictEqual(dueReminders(read, now).length, 0);

  const away = data({}); away.log["2026-10-18"] = { read: true };
  assert.match(dueReminders(away, now)[0].body, /5 days/);
});

test("cell group and verse reminders", () => {
  const now = new Date("2026-10-23T11:00:00Z"); // Fri 19:00 in Manila
  const data = {
    settings: { tz: "Asia/Manila", reminders: { cell: { on: true, day: 5, time: "19:00", note: "At Kuya Mark's" }, verse: { on: true, time: "19:00" } } },
    next: { verse: "John 3:16" },
  };
  const due = dueReminders(data, now);
  assert.deepStrictEqual(due.map(d => d.key.split(":")[0]), ["cell", "verse"]);
  assert.match(due[0].body, /Kuya Mark/);
});

/* ---------------- Curriculum ---------------- */
test("curriculum is complete and well-formed", () => {
  const ctx = { window: {} };
  require("node:vm").runInNewContext(fs.readFileSync(path.join(__dirname, "../public/curriculum.js"), "utf8"), ctx);
  const C = JSON.parse(JSON.stringify(ctx.window.CURRICULUM)); // plain objects from the vm realm
  assert.deepStrictEqual(C.LEVELS.map(l => l.rank), ["Seeker", "Believer", "Disciple", "Leader", "Multiplier"]);
  const ids = new Set();
  for (const t of C.TRACKS) {
    assert.ok(C.LEVELS.some(l => l.level === t.level), t.id);
    for (const l of t.lessons) {
      assert.ok(!ids.has(l.id), "duplicate id " + l.id); ids.add(l.id);
      assert.ok(l.read.length && l.verse.ref && l.verse.text && l.truth && l.action, l.id);
      assert.ok(l.points.length >= 3 && l.questions.length >= 3, l.id);
    }
  }
  for (const lv of C.LEVELS) assert.ok(C.TRACKS.some(t => t.level === lv.level), "level without a track: " + lv.level);
  assert.strictEqual(C.PLANS.find(p => p.id === "nt125").days.length, 125);
});
