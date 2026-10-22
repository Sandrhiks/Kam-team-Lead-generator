"use strict";

// Runs only when TEST_DATABASE_URL points at a disposable Postgres database.
// Starts the real server twice to check that accounts, progress and the push
// keys survive a restart (what a redeploy on Render looks like).
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawn } = require("node:child_process");

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "set TEST_DATABASE_URL to run";

function startServer(port) {
  const child = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: url, SESSION_SECRET: "pg-test", ALLOWED_EMAILS: "*", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", d => { out += d; if (out.includes("on http://")) resolve(child); });
    child.stderr.on("data", d => { out += d; });
    child.on("exit", code => reject(new Error(`server exited ${code}: ${out}`)));
  });
}
const stop = child => new Promise(r => { child.removeAllListeners("exit"); child.on("exit", r); child.kill(); });

test("Postgres: data and push keys survive a restart", { skip }, async () => {
  const { Client } = require("pg");
  const db = new Client({ connectionString: url });
  await db.connect();
  for (const t of ["kam_users", "bible_progress", "bible_push", "bible_meta"]) await db.query(`DROP TABLE IF EXISTS ${t}`);

  const port = 3900 + Math.floor(Math.random() * 90);
  const base = `http://127.0.0.1:${port}`;
  const json = { "Content-Type": "application/json" };

  let s = await startServer(port);
  const up = await fetch(base + "/auth/signup", { method: "POST", headers: json, body: JSON.stringify({ email: "pg@church.test", password: "faith hope love", name: "PG" }) });
  assert.strictEqual(up.status, 201);
  const cookie = up.headers.get("set-cookie").split(";")[0];
  const updated = Date.now();
  const put = await fetch(base + "/api/progress", { method: "PUT", headers: { ...json, Cookie: cookie }, body: JSON.stringify({ data: { lessons: { "life-1": { done: updated } } }, updated }) });
  assert.strictEqual(put.status, 200);
  const key1 = (await (await fetch(base + "/api/push/key", { headers: { Cookie: cookie } })).json()).publicKey;
  await stop(s);

  s = await startServer(port);
  try {
    const key2 = (await (await fetch(base + "/api/push/key", { headers: { Cookie: cookie } })).json()).publicKey;
    assert.strictEqual(key2, key1, "push keys must not change on restart");
    const back = await (await fetch(base + "/api/progress", { headers: { Cookie: cookie } })).json();
    assert.strictEqual(back.updated, updated);
    assert.ok(back.data.lessons["life-1"]);
  } finally {
    await stop(s);
    await db.end();
  }
});
