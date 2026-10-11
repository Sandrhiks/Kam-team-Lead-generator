"use strict";

// Kam Team Lead Generator: static host + GoHighLevel relay.
// The browser posts leads to /api/ghl; this server forwards them to the real
// GHL webhook, whose URL only ever lives in the server environment.
// No dependencies: Node 18+ (built-in fetch).

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const GHL_WEBHOOK_URL = (process.env.GHL_WEBHOOK_URL || "").trim();
const API_KEY = process.env.API_KEY || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 10000;
const RATE_LIMIT = { windowMs: 60000, max: Number(process.env.RATE_LIMIT_PER_MIN) || 60 };

if (GHL_WEBHOOK_URL && !/^https:\/\//.test(GHL_WEBHOOK_URL)) {
  console.error("GHL_WEBHOOK_URL must start with https://");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

/* ---------------- Helpers ---------------- */
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

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? String(fwd).split(",")[0].trim() : req.socket.remoteAddress) || "unknown";
}

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > RATE_LIMIT.windowMs) { hits.set(ip, { start: now, n: 1 }); return false; }
  h.n++;
  return h.n > RATE_LIMIT.max;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (now - h.start > RATE_LIMIT.windowMs) hits.delete(ip);
}, RATE_LIMIT.windowMs).unref();

// Same-origin requests are always allowed; cross-origin only if listed.
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  if (origin === `${proto}://${req.headers.host}`) return true;
  return ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Payload too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ---------------- Routes ---------------- */
async function handleRelay(req, res) {
  if (!originAllowed(req)) return sendJson(res, 403, { ok: false, error: "Origin not allowed" });
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  if (rateLimited(clientIp(req))) return sendJson(res, 429, { ok: false, error: "Too many requests" });
  if (API_KEY && !safeEqual(req.headers["x-api-key"] || "", API_KEY)) {
    return sendJson(res, 401, { ok: false, error: "Invalid API key" });
  }
  if (!GHL_WEBHOOK_URL) return sendJson(res, 503, { ok: false, error: "GHL_WEBHOOK_URL is not configured on the server" });

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, e.status || 400, { ok: false, error: e.status ? e.message : "Body must be JSON" });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return sendJson(res, 400, { ok: false, error: "Body must be a JSON object" });
  }

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

function handleStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  securityHeaders(res);
  const pathname = req.url.split("?")[0];
  if (pathname.startsWith("/api/")) applyCors(req, res);
  if (pathname === "/api/ghl") {
    return handleRelay(req, res).catch(e => { console.error(e); sendJson(res, 500, { ok: false, error: "Server error" }); });
  }
  if (pathname === "/api/health") {
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    return sendJson(res, 200, { ok: true, relay: !!GHL_WEBHOOK_URL, apiKeyRequired: !!API_KEY });
  }
  if (pathname.startsWith("/api/")) return sendJson(res, 404, { ok: false, error: "Not found" });
  handleStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Kam Team Lead Generator on http://localhost:${PORT}`);
    console.log(GHL_WEBHOOK_URL ? "GHL relay: enabled at /api/ghl" : "GHL relay: disabled (set GHL_WEBHOOK_URL)");
    if (!API_KEY) console.log("API_KEY not set: relay accepts any same-origin or allowed-origin request");
  });
}

module.exports = server;
