"use strict";

// Kam Team Bible Study Guide: static host + sign-in + progress sync + push reminders.
// Every page and API call needs a signed-in member, except the sign-in page and
// the few files it needs. Accounts reuse the lead generator's account code
// (../lib/users.js); progress and push subscriptions live in ./lib/store.js.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const users = require("../lib/users");
const { createStore, MAX_PROGRESS_BYTES } = require("./lib/store");
const push = require("./lib/push");
const { dueReminders } = require("./lib/reminders");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3100;
const ALLOWED_EMAILS = list(process.env.ALLOWED_EMAILS || "*").map(s => s.toLowerCase());
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 64 * 1024;
const COOKIE = "kbs_session";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:team@kam-team.com";

let SESSION_SECRET = process.env.SESSION_SECRET || "";
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET not set: using a random one, so everyone is signed out when the server restarts");
}

const storage = {
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATA_DIR || path.join(__dirname, "data"),
};
const accounts = users.createStore(storage);
const store = createStore(storage);
// Push keys: from the environment if set, otherwise generated once and kept in
// the data store, so they survive redeploys on hosts with a throwaway disk.
let vapid = null;
async function initVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = push.vapidFrom(process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  } else {
    const k = JSON.parse(await store.getOrSetMeta("vapid", () => JSON.stringify(push.generateVapidKeys())));
    vapid = push.vapidFrom(k.publicKey, k.privateKey);
  }
  server.vapid = vapid;
}

// Pages and files anyone may load without signing in.
const PUBLIC_PATHS = new Set([
  "/login", "/login.html", "/kam-team-logo.png", "/styles.css", "/icon.svg",
  "/manifest.webmanifest", "/sw.js", "/api/health",
]);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

/* ---------------- Helpers ---------------- */
function list(v) {
  return String(v || "").split(",").map(s => s.trim()).filter(Boolean);
}

function loadDotEnv(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function redirect(res, to) {
  res.writeHead(302, { Location: to, "Cache-Control": "no-store" });
  res.end();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? String(fwd).split(",")[0].trim() : req.socket.remoteAddress) || "unknown";
}

function isHttps(req) {
  return req.socket.encrypted || String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `${isHttps(req) ? "https" : "http"}://${req.headers.host}`;
}

function makeLimiter(windowMs, max) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (now - h.start > windowMs) hits.delete(k);
  }, windowMs).unref();
  return key => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); return false; }
    h.n++;
    return h.n > max;
  };
}
const authLimited = makeLimiter(15 * 60000, Number(process.env.AUTH_ATTEMPTS_PER_15_MIN) || 20);
const testPushLimited = makeLimiter(10 * 60000, 5);

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Payload too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonObject(req, limit) {
  let v;
  try { v = JSON.parse(await readBody(req, limit)); } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : "Body must be JSON"), { status: e.status || 400 });
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw Object.assign(new Error("Body must be a JSON object"), { status: 400 });
  }
  return v;
}

/* ---------------- Sessions ---------------- */
// Cookie = base64url(JSON payload) + "." + HMAC, same scheme as the lead generator.
function sign(data) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

function sessionCookie(req, user) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const data = Buffer.from(JSON.stringify({ e: user.email, pv: users.passwordVersion(user), exp })).toString("base64url");
  return `${COOKIE}=${data}.${sign(data)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? "; Secure" : ""}`;
}

function clearCookie(req) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`;
}

function readCookie(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return "";
}

async function currentUser(req) {
  const raw = readCookie(req);
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const data = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), sign(data))) return null;
  let s;
  try { s = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); } catch { return null; }
  if (!s || typeof s.exp !== "number" || s.exp < Date.now()) return null;
  const user = await accounts.get(s.e);
  if (!user || users.passwordVersion(user) !== s.pv) return null;
  return user;
}

// ALLOWED_EMAILS: "*" (default, open sign-up for the congregation), or a list of
// addresses and "@domain" entries. An empty value means only the first account.
async function signupAllowed(email) {
  if (ALLOWED_EMAILS.includes("*")) return true;
  if (!ALLOWED_EMAILS.length) return (await accounts.count()) === 0;
  const domain = email.slice(email.lastIndexOf("@"));
  return ALLOWED_EMAILS.includes(email) || ALLOWED_EMAILS.includes(domain);
}

/* ---------------- Routes ---------------- */
async function handleAuth(req, res, pathname) {
  if (pathname === "/auth/me") {
    const user = await currentUser(req);
    return user ? sendJson(res, 200, { ok: true, email: user.email, name: user.name })
      : sendJson(res, 401, { ok: false, error: "Not signed in" });
  }
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: "Origin not allowed" });

  if (pathname === "/auth/logout") {
    res.setHeader("Set-Cookie", clearCookie(req));
    return sendJson(res, 200, { ok: true });
  }
  if (pathname !== "/auth/login" && pathname !== "/auth/signup") {
    return sendJson(res, 404, { ok: false, error: "Not found" });
  }
  if (authLimited(clientIp(req))) {
    return sendJson(res, 429, { ok: false, error: "Too many attempts. Wait 15 minutes and try again." });
  }

  const body = await readJsonObject(req);
  const email = users.normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!users.validEmail(email)) return sendJson(res, 400, { ok: false, error: "Enter a valid email address." });

  if (pathname === "/auth/login") {
    const user = await accounts.get(email);
    const ok = user ? await users.verifyPassword(password, user.hash) : (await users.burnPasswordCheck(password), false);
    if (!ok) return sendJson(res, 401, { ok: false, error: "Email or password is incorrect." });
    res.setHeader("Set-Cookie", sessionCookie(req, user));
    return sendJson(res, 200, { ok: true, email: user.email, name: user.name });
  }

  const name = String(body.name || "").trim().slice(0, 100);
  if (password.length < 8) return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters." });
  if (password.length > 200) return sendJson(res, 400, { ok: false, error: "Password is too long." });
  if (!(await signupAllowed(email))) {
    return sendJson(res, 403, { ok: false, error: "This email isn't approved yet. Ask your cell leader or church admin." });
  }
  const user = { email, name, hash: await users.hashPassword(password), created: Date.now() };
  if (!(await accounts.create(user))) {
    return sendJson(res, 409, { ok: false, error: "An account with this email already exists. Sign in instead." });
  }
  console.log(`New member: ${email}`);
  res.setHeader("Set-Cookie", sessionCookie(req, user));
  return sendJson(res, 201, { ok: true, email: user.email, name: user.name });
}

// GET returns { data, updated } (or nulls for a new member).
// PUT { data, updated } saves it unless the server already has a newer copy,
// in which case it answers 409 with that copy so the app can adopt it.
async function handleProgress(req, res, user) {
  if (req.method === "GET") {
    const doc = await store.getProgress(user.email);
    return sendJson(res, 200, { ok: true, data: doc ? doc.data : null, updated: doc ? doc.updated : 0 });
  }
  if (req.method !== "PUT") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  const body = await readJsonObject(req, MAX_PROGRESS_BYTES);
  const updated = Number(body.updated);
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return sendJson(res, 400, { ok: false, error: "data must be an object" });
  }
  if (!Number.isFinite(updated) || updated <= 0 || updated > Date.now() + 864e5) {
    return sendJson(res, 400, { ok: false, error: "updated must be a recent timestamp" });
  }
  const r = await store.saveProgress(user.email, body.data, updated);
  if (!r.saved) return sendJson(res, 409, { ok: false, error: "A newer copy exists", data: r.current.data, updated: r.current.updated });
  return sendJson(res, 200, { ok: true, updated });
}

async function handlePush(req, res, pathname, user) {
  if (pathname === "/api/push/key") return sendJson(res, 200, { ok: true, publicKey: vapid.publicKey });
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  const body = await readJsonObject(req);

  if (pathname === "/api/push/subscribe") {
    if (!push.validSubscription(body.subscription)) return sendJson(res, 400, { ok: false, error: "Invalid subscription" });
    const { endpoint, keys } = body.subscription;
    await store.addSubscription(user.email, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/push/unsubscribe") {
    await store.removeSubscription(String(body.endpoint || ""), user.email);
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/push/test") {
    if (testPushLimited(user.email)) return sendJson(res, 429, { ok: false, error: "Wait a few minutes before sending another test." });
    const n = await sendToUser(user.email, {
      title: "Reminders are on \u{2705}", body: "This is how your Bible study reminders will look.", url: "/#today", tag: "test",
    });
    return n ? sendJson(res, 200, { ok: true, sent: n })
      : sendJson(res, 404, { ok: false, error: "No device is subscribed yet. Turn on notifications first." });
  }
  return sendJson(res, 404, { ok: false, error: "Not found" });
}

function serveFile(req, res, rel) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    // The app shell changes with each release, so let the service worker do the caching.
    const fresh = ext === ".html" || ext === ".js" || ext === ".css" || ext === ".webmanifest";
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": fresh ? "no-cache" : "public, max-age=86400",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

async function route(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end(); }

  if (pathname === "/api/health") return sendJson(res, 200, { ok: true, storage: store.kind.split(" ")[0] });
  if (pathname.startsWith("/auth/")) return handleAuth(req, res, pathname);

  const user = await currentUser(req);
  if (pathname.startsWith("/api/")) {
    if (!user) return sendJson(res, 401, { ok: false, error: "Sign in first" });
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: "Origin not allowed" });
    if (pathname === "/api/progress") return handleProgress(req, res, user);
    if (pathname.startsWith("/api/push/")) return handlePush(req, res, pathname, user);
    return sendJson(res, 404, { ok: false, error: "Not found" });
  }

  if (pathname === "/login" || pathname === "/login.html") {
    return user ? redirect(res, "/") : serveFile(req, res, "/login.html");
  }
  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const wantsPage = pathname.endsWith("/") || pathname.endsWith(".html");
    return wantsPage ? redirect(res, "/login") : sendJson(res, 401, { ok: false, error: "Sign in first" });
  }
  serveFile(req, res, pathname);
}

/* ---------------- Reminder scheduler ---------------- */
// Once a minute, look at every subscribed member's saved settings and send
// whatever is due. `sent` remembers today's reminder keys so a reminder goes
// out once even if a tick runs twice in the same minute.
const sent = new Map();

async function sendToUser(email, message, subs) {
  subs = subs || (await store.listSubscriptions()).filter(s => s.email === email);
  let n = 0;
  for (const { sub } of subs) {
    try {
      const r = await push.send(vapid, VAPID_SUBJECT, sub, message);
      if (r.gone) await store.removeSubscription(sub.endpoint);
      else if (r.ok) n++;
      else console.warn(`Push to ${email} failed: ${r.status}`);
    } catch (e) {
      console.warn(`Push to ${email} failed:`, e.message);
    }
  }
  return n;
}

async function tick(now = new Date()) {
  const byUser = new Map();
  for (const s of await store.listSubscriptions()) {
    if (!byUser.has(s.email)) byUser.set(s.email, []);
    byUser.get(s.email).push(s);
  }
  let total = 0;
  for (const [email, subs] of byUser) {
    const doc = await store.getProgress(email);
    if (!doc) continue;
    const done = sent.get(email) || new Set();
    for (const m of dueReminders(doc.data, now)) {
      if (done.has(m.key)) continue;
      done.add(m.key);
      total += await sendToUser(email, { title: m.title, body: m.body, url: m.url, tag: m.key.split(":")[0] }, subs);
    }
    // Keys carry the date, so anything older than two days can go.
    const cutoff = new Date(now.getTime() - 2 * 864e5).toISOString().slice(0, 10);
    for (const k of done) if (k.split(":")[1] < cutoff) done.delete(k);
    sent.set(email, done);
  }
  return total;
}

function startScheduler() {
  const run = () => tick().catch(e => console.error("Reminder tick failed:", e.message));
  // Line the ticks up with the start of each minute.
  setTimeout(() => { run(); setInterval(run, 60000).unref(); }, 60000 - (Date.now() % 60000) + 500).unref();
}

const server = http.createServer((req, res) => {
  securityHeaders(res);
  route(req, res).catch(e => {
    if (e.status) return sendJson(res, e.status, { ok: false, error: e.message });
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Server error" });
  });
});
server.ready = Promise.all([accounts.init(), store.init()]).then(initVapid);
server.tick = tick;

if (require.main === module) {
  server.ready.then(() => {
    server.listen(PORT, () => {
      console.log(`Kam Team Bible Study Guide on http://localhost:${PORT}`);
      console.log(`Data stored in: ${store.kind}`);
      console.log(ALLOWED_EMAILS.includes("*") ? "Sign-up: open to anyone" : `Sign-up: limited to ${ALLOWED_EMAILS.join(", ") || "the first account"}`);
      startScheduler();
    });
  }).catch(e => {
    console.error("Couldn't open the data store:", e.message);
    process.exit(1);
  });
}

module.exports = server;
