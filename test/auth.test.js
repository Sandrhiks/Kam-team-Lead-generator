"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("../test-support/helpers");

const t = setup({ ALLOWED_EMAILS: "@kam.test,guest@else.test" });
const request = email => t.req("/auth/otp/request", { method: "POST", body: { email } });
const verify = (email, code, name) => t.req("/auth/otp/verify", { method: "POST", body: { email, code, name } });

before(() => t.start());
after(() => t.stop());

test("signed-out visitors go to the sign-in page; it and its assets are public", async () => {
  for (const p of ["/", "/index.html"]) {
    const r = await t.req(p);
    assert.strictEqual(r.status, 302, p);
    assert.strictEqual(r.headers.get("location"), "/login");
  }
  const login = await t.req("/login");
  assert.strictEqual(login.status, 200);
  assert.match(await login.text(), /Email me a code/);
  for (const p of ["/js/login.js", "/css/base.css", "/kam-team-logo.png"]) assert.strictEqual((await t.req(p)).status, 200, p);
  assert.strictEqual((await t.req("/js/app.js")).status, 401);
  assert.strictEqual((await t.req("/api/designs")).status, 401);
  assert.match((await t.req("/login")).headers.get("content-security-policy"), /script-src 'self'/);
});

test("sends a 6-digit code to approved emails only", async () => {
  assert.strictEqual((await request("stranger@gmail.com")).status, 403);
  assert.strictEqual((await request("not-an-email")).status, 400);
  const r = await request(" Agent@Kam.test ");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { ok: true, newAccount: true, minutes: 10, devLog: false });
  const mail = t.mail.sent.at(-1);
  assert.strictEqual(mail.to, "agent@kam.test");
  assert.match(mail.code, /^\d{6}$/);
  assert.match(mail.subject, new RegExp(mail.code));
  assert.match(mail.html, new RegExp(mail.code));
});

test("codes are stored hashed and a second request waits for the cooldown", async () => {
  const stored = fs.readFileSync(path.join(t.dataDir, "codes.json"), "utf8");
  assert.doesNotMatch(stored, new RegExp(t.lastCode("agent@kam.test")));
  const again = await request("agent@kam.test");
  assert.strictEqual(again.status, 429);
  assert.match((await again.json()).error, /Wait \d+ seconds/);
});

test("a wrong code is rejected, the right one signs in and creates the account", async () => {
  const code = t.lastCode("agent@kam.test");
  const wrong = String((Number(code) + 1) % 1e6).padStart(6, "0");
  assert.strictEqual((await verify("agent@kam.test", wrong)).status, 401);
  const ok = await verify("agent@kam.test", code, "Sam Agent");
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  const me = await (await t.req("/auth/me", { cookie: t.cookieOf(ok) })).json();
  assert.strictEqual(me.email, "agent@kam.test");
  assert.strictEqual(me.name, "Sam Agent");
  // A code works only once.
  assert.strictEqual((await verify("agent@kam.test", code)).status, 401);
  const r = await t.req("/", { cookie: t.cookieOf(ok) });
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Design Studio/);
});

test("five wrong guesses burn the code", async () => {
  assert.strictEqual((await request("guest@else.test")).status, 200);
  const code = t.lastCode("guest@else.test");
  const wrong = String((Number(code) + 7) % 1e6).padStart(6, "0");
  for (let i = 0; i < 4; i++) assert.strictEqual((await verify("guest@else.test", wrong)).status, 401);
  const fifth = await verify("guest@else.test", wrong);
  assert.match((await fifth.json()).error, /Too many wrong codes/);
  assert.strictEqual((await verify("guest@else.test", code)).status, 401);
});

test("returning users are recognized and accounts store no secrets", async () => {
  await new Promise(r => setTimeout(r, 10));
  const r = await request("agent@kam.test");
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).newAccount, false);
  const users = JSON.parse(fs.readFileSync(path.join(t.dataDir, "users.json"), "utf8"));
  assert.ok(users["agent@kam.test"].created);
  assert.strictEqual(users["agent@kam.test"].sv, 0);
  assert.deepStrictEqual(Object.keys(users["agent@kam.test"]).sort(), ["created", "email", "lastLogin", "name", "sv"]);
});

test("a tampered cookie is rejected", async () => {
  const cookie = await t.signIn("tamper@kam.test");
  const [data, sig] = cookie.split("=")[1].split(".");
  const forged = JSON.parse(Buffer.from(data, "base64url"));
  forged.e = "agent@kam.test";
  const bad = "kds_session=" + Buffer.from(JSON.stringify(forged)).toString("base64url") + "." + sig;
  assert.strictEqual((await t.req("/", { cookie: bad })).status, 302);
});

test("sign out clears the cookie; sign out of all devices ends every session", async () => {
  const a = await t.signIn("multi@kam.test");
  await new Promise(r => setTimeout(r, 5));
  const out = await t.req("/auth/logout", { method: "POST", cookie: a });
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  // Logout only clears this browser's cookie; the copy still works until "all devices".
  assert.strictEqual((await t.req("/auth/me", { cookie: a })).status, 200);
  const all = await t.req("/auth/logout-all", { method: "POST", cookie: a });
  assert.strictEqual(all.status, 200);
  assert.strictEqual((await t.req("/auth/me", { cookie: a })).status, 401);
});

test("auth endpoints refuse cross-site posts", async () => {
  const r = await t.req("/auth/otp/request", { method: "POST", body: { email: "x@kam.test" }, headers: { Origin: "https://evil.example" } });
  assert.strictEqual(r.status, 403);
});

test("a failed email send reports 502 and doesn't leave a code behind", async () => {
  t.mail.status = 500;
  const r = await request("fail@kam.test");
  t.mail.status = 200;
  assert.strictEqual(r.status, 502);
  assert.strictEqual((await request("fail@kam.test")).status, 200); // no cooldown left over
});
