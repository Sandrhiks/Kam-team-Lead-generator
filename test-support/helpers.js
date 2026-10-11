"use strict";

// Shared setup: temp account store, a stubbed GHL upstream, and a running server.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function setup(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kam-test-"));
  Object.assign(process.env, {
    GHL_WEBHOOK_URL: "https://ghl.test/hooks/abc",
    SESSION_SECRET: "test-secret",
    DATA_DIR: dataDir,
    DATABASE_URL: "",
  }, env);

  // The relay only accepts https upstreams, so intercept the outbound call by stubbing fetch.
  const ghl = { received: [], status: 200 };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).startsWith("https://ghl.test/")) {
      ghl.received.push({ url, body: JSON.parse(opts.body) });
      return new Response("{}", { status: ghl.status });
    }
    return realFetch(url, opts);
  };

  const server = require("../server.js");
  const ctx = { server, ghl, dataDir, base: "" };

  ctx.start = async () => {
    await server.ready;
    await new Promise(r => server.listen(0, r));
    ctx.base = `http://127.0.0.1:${server.address().port}`;
  };
  ctx.stop = () => new Promise(r => server.close(r));

  ctx.req = (p, { method = "GET", body, headers = {}, cookie } = {}) => realFetch(ctx.base + p, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

  ctx.cookieOf = r => (r.headers.get("set-cookie") || "").split(";")[0];

  ctx.signup = (email, password = "correct horse", name = "Test User") =>
    ctx.req("/auth/signup", { method: "POST", body: { email, password, name } });

  return ctx;
}

module.exports = { setup };
