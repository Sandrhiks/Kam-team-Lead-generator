"use strict";

// Shared test setup: temp storage, stubbed outbound email / image APIs, and a running server.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function setup(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kds-test-"));
  Object.assign(process.env, {
    SESSION_SECRET: "test-secret",
    DATA_DIR: dataDir,
    DATABASE_URL: "",
    MAIL_WEBHOOK_URL: "https://mail.test/hook",
    RESEND_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
  }, env);

  // Intercept outbound email and image calls; everything else goes to the network as usual.
  const mail = { sent: [], status: 200 };
  const images = { calls: [], status: 200 };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).startsWith("https://mail.test/")) {
      mail.sent.push(JSON.parse(opts.body));
      return new Response("{}", { status: mail.status });
    }
    if (String(url).startsWith("https://api.openai.com/")) {
      images.calls.push(JSON.parse(opts.body));
      return new Response(JSON.stringify(images.status === 200 ? { data: [{ b64_json: "iVBORw0KGgo=" }] } : { error: { message: "nope" } }), { status: images.status });
    }
    return realFetch(url, opts);
  };

  const server = require("../server.js");
  const ctx = { server, mail, images, dataDir, base: "" };

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
  ctx.lastCode = email => [...mail.sent].reverse().find(m => m.to === email).code;

  // Full sign-in: request a code, read it from the stubbed email, verify it.
  ctx.signIn = async (email, name = "Test User") => {
    const r1 = await ctx.req("/auth/otp/request", { method: "POST", body: { email } });
    if (r1.status !== 200) throw new Error(`code request failed: ${r1.status} ${await r1.text()}`);
    const r2 = await ctx.req("/auth/otp/verify", { method: "POST", body: { email, code: ctx.lastCode(email.toLowerCase()), name } });
    if (r2.status !== 200) throw new Error(`verify failed: ${r2.status}`);
    return ctx.cookieOf(r2);
  };

  return ctx;
}

const design = (id, extra = {}) => ({
  id, name: "Test " + id, width: 1080, height: 1080, background: "#111111", stage: "brief",
  elements: [{ id: "h1", type: "text", text: "JUST LISTED", x: 80, y: 80, w: 900, h: 100, fontSize: 80, fontWeight: 800, color: "#FFFFFF", fontFamily: "Archivo" }],
  ...extra,
});

module.exports = { setup, design };
