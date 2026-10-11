"use strict";

// Kam Team Lead Generator: static host + sign-in + GoHighLevel relay.
// Every page and API call needs a signed-in user, except the sign-in page itself.
// The browser posts leads to /api/ghl; this server forwards them to the real
// GHL webhook, whose URL only ever lives in the server environment.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const users = require("./lib/users");
const leads = require("./lib/leads");
const { createChat } = require("./lib/chat");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const GHL_WEBHOOK_URL = (process.env.GHL_WEBHOOK_URL || "").trim();
const API_KEY = process.env.API_KEY || "";
const ALLOWED_ORIGINS = list(process.env.ALLOWED_ORIGINS).map(s => s.replace(/\/$/, ""));
const ALLOWED_EMAILS = list(process.env.ALLOWED_EMAILS).map(s => s.toLowerCase());
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 64 * 1024;
const MAX_SYNC_BODY = 4 * 1024 * 1024;
const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || "").trim();
const UPSTREAM_TIMEOUT_MS = 10000;
const COOKIE = "kt_session";

let SESSION_SECRET = process.env.SESSION_SECRET || "";
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET not set: using a random one, so everyone is signed out when the server restarts");
}

if (GHL_WEBHOOK_URL && !/^https:\/\//.test(GHL_WEBHOOK_URL)) {
  console.error("GHL_WEBHOOK_URL must start with https://");
  process.exit(1);
}

const storage = {
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATA_DIR || path.join(__dirname, "data"),
};
const store = users.createStore(storage);
const leadStore = leads.createLeadStore(storage);
const chat = createChat({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.CHAT_MODEL || "claude-opus-5-5",
  supportEmail: SUPPORT_EMAIL,
});

// Pages and files anyone may load without signing in.
const PUBLIC_PATHS = new Set(["/login", "/login.html", "/kam-team-logo.png", "/api/health"]);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
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
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
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
const relayLimited = makeLimiter(60000, Number(process.env.RATE_LIMIT_PER_MIN) || 60);
const authLimited = makeLimiter(15 * 60000, Number(process.env.AUTH_ATTEMPTS_PER_15_MIN) || 20);
const chatLimited = makeLimiter(10 * 60000, Number(process.env.CHAT_MESSAGES_PER_10_MIN) || 30);

function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `${isHttps(req) ? "https" : "http"}://${req.headers.host}`;
}

// Same-origin requests are always allowed; cross-origin only if listed.
function originAllowed(req) {
  if (sameOrigin(req)) return true;
  return ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(req.headers.origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

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
// Cookie = base64url(JSON payload) + "." + HMAC. Stateless, so it survives restarts
// as long as SESSION_SECRET stays the same.
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
  const user = await store.get(s.e);
  if (!user || users.passwordVersion(user) !== s.pv) return null;
  return user;
}

/* ---------------- Sign-up rules ---------------- */
// ALLOWED_EMAILS lists addresses ("sam@x.com") and whole domains ("@x.com"),
// or "*" for open sign-up. With no list, only the very first account can be created.
async function signupAllowed(email) {
  if (ALLOWED_EMAILS.includes("*")) return true;
  if (!ALLOWED_EMAILS.length) return (await store.count()) === 0;
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
    const user = await store.get(email);
    const ok = user ? await users.verifyPassword(password, user.hash) : (await users.burnPasswordCheck(password), false);
    if (!ok) return sendJson(res, 401, { ok: false, error: "Email or password is incorrect." });
    res.setHeader("Set-Cookie", sessionCookie(req, user));
    return sendJson(res, 200, { ok: true, email: user.email, name: user.name });
  }

  // Sign-up
  const name = String(body.name || "").trim().slice(0, 100);
  if (password.length < 8) return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters." });
  if (password.length > 200) return sendJson(res, 400, { ok: false, error: "Password is too long." });
  if (!(await signupAllowed(email))) {
    return sendJson(res, 403, { ok: false, error: "This email isn't approved for an account. Ask your admin to add it." });
  }
  const user = { email, name, hash: await users.hashPassword(password), created: Date.now() };
  if (!(await store.create(user))) {
    return sendJson(res, 409, { ok: false, error: "An account with this email already exists. Sign in instead." });
  }
  console.log(`New account: ${email}`);
  res.setHeader("Set-Cookie", sessionCookie(req, user));
  return sendJson(res, 201, { ok: true, email: user.email, name: user.name });
}

async function handleRelay(req, res, user) {
  if (!originAllowed(req)) return sendJson(res, 403, { ok: false, error: "Origin not allowed" });
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  if (relayLimited(clientIp(req))) return sendJson(res, 429, { ok: false, error: "Too many requests" });
  // Signed-in users are trusted; outside tools can use the shared API key instead.
  if (!user && !(API_KEY && safeEqual(req.headers["x-api-key"] || "", API_KEY))) {
    return sendJson(res, 401, { ok: false, error: "Sign in first" });
  }
  if (!GHL_WEBHOOK_URL) return sendJson(res, 503, { ok: false, error: "GHL_WEBHOOK_URL is not configured on the server" });

  const payload = await readJsonObject(req);
  try {
    const r = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!r.ok) {
      console.warn(`GHL replied ${r.status} for lead ${payload.lead_id || "?"}`);
      return sendJson(res, 502, { ok: false, error: `GHL replied ${r.status}`, upstreamStatus: r.status });
    }
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    console.warn("GHL request failed:", e.name === "TimeoutError" ? "timeout" : e.message);
    return sendJson(res, 502, { ok: false, error: "Couldn't reach GHL" });
  }
}

// GET /api/leads returns all of the user's leads (and tombstones for deleted ones).
// POST /api/leads/sync { upsert: [lead...], delete: [id...] } saves changes; the newer copy wins.
async function handleLeads(req, res, pathname, user) {
  if (!user) return sendJson(res, 401, { ok: false, error: "Sign in first" });
  if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: "Origin not allowed" });
  if (pathname === "/api/leads" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, leads: await leadStore.list(user.email), now: Date.now() });
  }
  if (pathname !== "/api/leads/sync") return sendJson(res, 404, { ok: false, error: "Not found" });
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  const body = await readJsonObject(req, MAX_SYNC_BODY);
  const upsert = Array.isArray(body.upsert) ? body.upsert : [];
  const del = Array.isArray(body.delete) ? body.delete : [];
  if (upsert.length + del.length > 1000) return sendJson(res, 413, { ok: false, error: "Send at most 1000 changes at a time" });
  const records = [];
  for (const lead of upsert) {
    const r = leads.checkLead(lead);
    if (typeof r === "string") return sendJson(res, 400, { ok: false, error: r });
    records.push(r);
  }
  if (!del.every(id => typeof id === "string" && /^[\w-]{1,64}$/.test(id))) {
    return sendJson(res, 400, { ok: false, error: "Invalid lead id to delete" });
  }
  const result = await leadStore.apply(user.email, records, del, Date.now());
  return sendJson(res, 200, { ok: true, ...result });
}

async function handleChat(req, res, user) {
  if (!user) return sendJson(res, 401, { ok: false, error: "Sign in first" });
  if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: "Origin not allowed" });
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  if (!chat) return sendJson(res, 503, { ok: false, error: "Chat support isn't set up yet. Ask your admin to add ANTHROPIC_API_KEY." });
  if (chatLimited(user.email)) return sendJson(res, 429, { ok: false, error: "You're sending messages quickly. Wait a few minutes and try again." });
  const body = await readJsonObject(req, 256 * 1024);
  return chat.stream(req, res, user, body);
}

function serveFile(req, res, rel) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=86400",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

async function route(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end(); }

  if (pathname.startsWith("/api/")) applyCors(req, res);
  if (pathname === "/api/health") {
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    return sendJson(res, 200, { ok: true, relay: !!GHL_WEBHOOK_URL, apiKeyRequired: !!API_KEY });
  }
  if (pathname.startsWith("/auth/")) return handleAuth(req, res, pathname);

  const user = await currentUser(req);
  if (pathname === "/api/ghl") return handleRelay(req, res, user);
  if (pathname === "/api/leads" || pathname === "/api/leads/sync") return handleLeads(req, res, pathname, user);
  if (pathname === "/api/chat") return handleChat(req, res, user);
  if (pathname === "/api/support") {
    if (!user) return sendJson(res, 401, { ok: false, error: "Sign in first" });
    return sendJson(res, 200, { ok: true, chat: !!chat, email: SUPPORT_EMAIL });
  }
  if (pathname.startsWith("/api/")) return sendJson(res, 404, { ok: false, error: "Not found" });

  if (pathname === "/login" || pathname === "/login.html") {
    return user ? redirect(res, "/") : serveFile(req, res, "/login.html");
  }
  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const wantsPage = pathname.endsWith("/") || pathname.endsWith(".html");
    return wantsPage ? redirect(res, "/login") : sendJson(res, 401, { ok: false, error: "Sign in first" });
  }
  serveFile(req, res, pathname);
}

const server = http.createServer((req, res) => {
  securityHeaders(res);
  route(req, res).catch(e => {
    if (e.status) return sendJson(res, e.status, { ok: false, error: e.message });
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Server error" });
  });
});
server.ready = Promise.all([store.init(), leadStore.init()]);

if (require.main === module) {
  server.ready.then(() => {
    server.listen(PORT, () => {
      console.log(`Kam Team Lead Generator on http://localhost:${PORT}`);
      console.log(`Accounts stored in: ${store.kind}`);
      console.log(GHL_WEBHOOK_URL ? "GHL relay: enabled at /api/ghl" : "GHL relay: disabled (set GHL_WEBHOOK_URL)");
      if (!ALLOWED_EMAILS.length) console.warn("ALLOWED_EMAILS not set: only the first account can be created");
      console.log(chat ? `Chat support: on (${chat.model})` : "Chat support: off (set ANTHROPIC_API_KEY)");
    });
  }).catch(e => {
    console.error("Couldn't open the account store:", e.message);
    process.exit(1);
  });
}

module.exports = server;
