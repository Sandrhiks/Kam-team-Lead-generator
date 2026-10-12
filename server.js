"use strict";

// Kam Team Design Studio: static host + email one-time-code sign-in + designs API +
// AI assistant (Claude) + optional image generation + support tickets.
// Every page and API call needs a signed-in user, except the sign-in page itself.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore } = require("./lib/store");
const { createOtp, createMailer, normalizeEmail, validEmail } = require("./lib/otp");
const { createAgent } = require("./lib/agent");
const { createImages } = require("./lib/images");
const D = require("./lib/design");
const catalog = require("./lib/catalog");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const PRODUCTION = process.env.NODE_ENV === "production";
const ALLOWED_EMAILS = list(process.env.ALLOWED_EMAILS).map(s => s.toLowerCase());
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;
const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || "").trim();
const PUBLIC_DIR = path.join(__dirname, "public");
const COOKIE = "kds_session";
const MAX_BODY = 64 * 1024;
const MAX_DESIGN_BODY = 16 * 1024 * 1024;
const MAX_ASSISTANT_BODY = 4 * 1024 * 1024;
const LIMITS = { design: 500, chat: 200, ticket: 200 };

let SESSION_SECRET = process.env.SESSION_SECRET || "";
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET not set: using a random one, so everyone is signed out when the server restarts");
}

const store = createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.DATA_DIR || path.join(__dirname, "data") });
const mailer = createMailer({
  resendKey: process.env.RESEND_API_KEY,
  from: process.env.MAIL_FROM || "Kam Team Design Studio <onboarding@resend.dev>",
  webhookUrl: process.env.MAIL_WEBHOOK_URL,
  production: PRODUCTION,
});
const otp = createOtp({ store, secret: SESSION_SECRET, minutes: Number(process.env.OTP_MINUTES) || 10, mailer });
const images = createImages({ apiKey: process.env.OPENAI_API_KEY, model: process.env.IMAGE_MODEL || "gpt-image-1" });
const agent = createAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.AI_MODEL || "claude-opus-5-5",
  supportEmail: SUPPORT_EMAIL,
  images,
});

const PUBLIC_PATHS = new Set(["/login", "/login.html", "/kam-team-logo.png", "/css/base.css", "/js/login.js", "/js/theme.js", "/api/health"]);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};

/* ---------------- Helpers ---------------- */
function list(v) { return String(v || "").split(",").map(s => s.trim()).filter(Boolean); }

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
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
    "frame-ancestors 'self'", "base-uri 'none'", "form-action 'self'",
  ].join("; "));
  if (PRODUCTION) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
const err = (res, status, error) => sendJson(res, status, { ok: false, error });

function redirect(res, to) { res.writeHead(302, { Location: to, "Cache-Control": "no-store" }); res.end(); }

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
    return ++h.n > max;
  };
}
const codeIpLimited = makeLimiter(15 * 60000, Number(process.env.CODE_REQUESTS_PER_15_MIN) || 10);
const codeEmailLimited = makeLimiter(60 * 60000, 6);
const verifyLimited = makeLimiter(15 * 60000, Number(process.env.VERIFY_ATTEMPTS_PER_15_MIN) || 30);
const assistantLimited = makeLimiter(10 * 60000, Number(process.env.AI_MESSAGES_PER_10_MIN) || 40);
const imageLimited = makeLimiter(60 * 60000, Number(process.env.IMAGES_PER_HOUR) || 30);

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

async function readJson(req, limit) {
  let v;
  try { v = JSON.parse(await readBody(req, limit)); } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : "Body must be JSON"), { status: e.status || 400 });
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Object.assign(new Error("Body must be a JSON object"), { status: 400 });
  return v;
}

/* ---------------- Sessions ---------------- */
// Cookie = base64url(JSON payload) + "." + HMAC. Stateless; "sign out of all devices"
// bumps the user's session version (sv), which invalidates every older cookie.
const sign = data => crypto.createHmac("sha256", SESSION_SECRET).update("session:" + data).digest("base64url");

function sessionCookie(req, user) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const data = Buffer.from(JSON.stringify({ e: user.email, sv: user.sv || 0, exp })).toString("base64url");
  return `${COOKIE}=${data}.${sign(data)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? "; Secure" : ""}`;
}
const clearCookie = req => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`;

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
  const user = await store.getUser(s.e);
  if (!user || (user.sv || 0) !== s.sv) return null;
  return user;
}

// ALLOWED_EMAILS lists addresses ("sam@x.com") and whole domains ("@x.com"), or "*" for
// open sign-up. With no list, only the very first account can be created.
async function signupAllowed(email) {
  if (ALLOWED_EMAILS.includes("*")) return true;
  if (!ALLOWED_EMAILS.length) return (await store.countUsers()) === 0;
  return ALLOWED_EMAILS.includes(email) || ALLOWED_EMAILS.includes(email.slice(email.lastIndexOf("@")));
}

const publicUser = u => ({ email: u.email, name: u.name || "", created: u.created });

/* ---------------- Auth routes ---------------- */
async function handleAuth(req, res, pathname) {
  if (pathname === "/auth/me") {
    const user = await currentUser(req);
    return user ? sendJson(res, 200, { ok: true, ...publicUser(user) }) : err(res, 401, "Not signed in");
  }
  if (req.method !== "POST") return err(res, 405, "Method not allowed");
  if (!sameOrigin(req)) return err(res, 403, "Origin not allowed");

  if (pathname === "/auth/logout") {
    res.setHeader("Set-Cookie", clearCookie(req));
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/auth/logout-all") {
    const user = await currentUser(req);
    if (user) await store.putUser({ ...user, sv: (user.sv || 0) + 1 });
    res.setHeader("Set-Cookie", clearCookie(req));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/auth/otp/request") {
    if (codeIpLimited(clientIp(req))) return err(res, 429, "Too many code requests. Wait 15 minutes and try again.");
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) return err(res, 400, "Enter a valid email address.");
    const existing = await store.getUser(email);
    if (!existing && !(await signupAllowed(email))) {
      return err(res, 403, "This email isn't approved for the Design Studio. Ask your admin to add it.");
    }
    if (codeEmailLimited(email)) return err(res, 429, "Too many codes for this email. Try again in an hour.");
    const r = await otp.issue(email);
    if (!r.ok) return err(res, r.status, r.error);
    return sendJson(res, 200, { ok: true, newAccount: !existing, minutes: otp.minutes, devLog: mailer.kind === "console" });
  }

  if (pathname === "/auth/otp/verify") {
    if (verifyLimited(clientIp(req))) return err(res, 429, "Too many attempts. Wait 15 minutes and try again.");
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) return err(res, 400, "Enter a valid email address.");
    const r = await otp.check(email, body.code);
    if (!r.ok) return err(res, r.status, r.error);
    let user = await store.getUser(email);
    const now = Date.now();
    if (!user) {
      // The code proves the email; check approval again in case the list changed meanwhile.
      if (!(await signupAllowed(email))) return err(res, 403, "This email isn't approved for the Design Studio.");
      user = { email, name: String(body.name || "").trim().slice(0, 100), created: now, sv: 0 };
      console.log(`New account: ${email}`);
    }
    user = { ...user, lastLogin: now };
    await store.putUser(user);
    res.setHeader("Set-Cookie", sessionCookie(req, user));
    return sendJson(res, 200, { ok: true, ...publicUser(user) });
  }
  return err(res, 404, "Not found");
}

/* ---------------- Owned documents: designs, chats, tickets ---------------- */
const idOk = id => /^[\w-]{1,64}$/.test(id);

async function handleDesigns(req, res, id, user) {
  if (!id) {
    if (req.method !== "GET") return err(res, 405, "Method not allowed");
    const all = (await store.listDocs(user.email, "design")).map(D.designSummary).sort((a, b) => b.updated - a.updated);
    return sendJson(res, 200, { ok: true, designs: all });
  }
  if (!idOk(id)) return err(res, 400, "Invalid design id");
  if (req.method === "GET") {
    const d = await store.getDoc(user.email, "design", id);
    return d ? sendJson(res, 200, { ok: true, design: d }) : err(res, 404, "Design not found");
  }
  if (req.method === "DELETE") {
    return (await store.deleteDoc(user.email, "design", id)) ? sendJson(res, 200, { ok: true }) : err(res, 404, "Design not found");
  }
  if (req.method !== "PUT") return err(res, 405, "Method not allowed");
  const body = await readJson(req, MAX_DESIGN_BODY);
  let d;
  try { d = D.cleanDesign({ ...body, id }, catalog.FONTS); } catch (e) {
    if (e instanceof D.DesignError) return err(res, 400, e.message);
    throw e;
  }
  if (d.elements.some(e => e.type === "image" && e.src.startsWith("asset:"))) return err(res, 400, "Save the design with its images included.");
  const prev = await store.getDoc(user.email, "design", id);
  if (!prev && (await store.countDocs(user.email, "design")) >= LIMITS.design) return err(res, 413, `You can keep up to ${LIMITS.design} designs. Delete some first.`);
  d.created = prev ? prev.created : d.created;
  d.updated = Date.now();
  await store.putDoc(user.email, "design", d);
  return sendJson(res, 200, { ok: true, updated: d.updated });
}

function cleanChat(raw, id) {
  const messages = (Array.isArray(raw.messages) ? raw.messages : []).slice(-200)
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, 20000) }));
  const title = String(raw.title || (messages[0] && messages[0].content) || "New chat").replace(/\s+/g, " ").trim().slice(0, 80);
  return { id, title, messages, pinned: raw.pinned === true, created: Number(raw.created) || Date.now(), updated: Date.now() };
}

async function handleChats(req, res, id, user) {
  if (!id) {
    if (req.method !== "GET") return err(res, 405, "Method not allowed");
    const all = (await store.listDocs(user.email, "chat"))
      .map(c => ({ id: c.id, title: c.title, pinned: c.pinned, updated: c.updated, count: c.messages.length }))
      .sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated));
    return sendJson(res, 200, { ok: true, chats: all });
  }
  if (!idOk(id)) return err(res, 400, "Invalid chat id");
  if (req.method === "GET") {
    const c = await store.getDoc(user.email, "chat", id);
    return c ? sendJson(res, 200, { ok: true, chat: c }) : err(res, 404, "Chat not found");
  }
  if (req.method === "DELETE") {
    return (await store.deleteDoc(user.email, "chat", id)) ? sendJson(res, 200, { ok: true }) : err(res, 404, "Chat not found");
  }
  if (req.method !== "PUT") return err(res, 405, "Method not allowed");
  const body = await readJson(req, 2 * 1024 * 1024);
  const prev = await store.getDoc(user.email, "chat", id);
  if (!prev && (await store.countDocs(user.email, "chat")) >= LIMITS.chat) return err(res, 413, `You can keep up to ${LIMITS.chat} chats. Delete some first.`);
  const c = cleanChat({ ...body, created: prev ? prev.created : body.created }, id);
  await store.putDoc(user.email, "chat", c);
  return sendJson(res, 200, { ok: true, chat: { id: c.id, title: c.title, updated: c.updated } });
}

const TICKET_CATEGORIES = ["How do I…", "Bug or error", "Account & sign-in", "Brand or template request", "AI tools", "Other"];

async function handleTickets(req, res, user) {
  if (req.method === "GET") {
    const all = (await store.listDocs(user.email, "ticket")).sort((a, b) => b.created - a.created);
    return sendJson(res, 200, { ok: true, tickets: all, categories: TICKET_CATEGORIES });
  }
  if (req.method !== "POST") return err(res, 405, "Method not allowed");
  const body = await readJson(req);
  const subject = String(body.subject || "").trim().slice(0, 140);
  const message = String(body.message || "").trim().slice(0, 5000);
  const category = TICKET_CATEGORIES.includes(body.category) ? body.category : "Other";
  if (!subject || !message) return err(res, 400, "Add a subject and describe the problem.");
  if ((await store.countDocs(user.email, "ticket")) >= LIMITS.ticket) return err(res, 413, "You've reached the ticket limit. Email support instead.");
  const now = Date.now();
  const ticket = { id: "KDS-" + now.toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase(), subject, message, category, status: "Open", created: now, updated: now };
  await store.putDoc(user.email, "ticket", ticket);
  let notified = false;
  if (SUPPORT_EMAIL && mailer.kind !== "none") {
    try {
      await mailer.send({
        to: SUPPORT_EMAIL,
        subject: `[Design Studio ${ticket.id}] ${subject}`,
        text: `From: ${user.name || ""} <${user.email}>\nCategory: ${category}\n\n${message}`,
        html: `<p><b>From:</b> ${esc(user.name || "")} &lt;${esc(user.email)}&gt;<br><b>Category:</b> ${esc(category)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`,
      });
      notified = true;
    } catch (e) { console.warn("Couldn't email ticket:", e.message); }
  }
  console.log(`Support ticket ${ticket.id} from ${user.email}: ${subject}`);
  return sendJson(res, 201, { ok: true, ticket, notified });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- AI routes ---------------- */
async function handleAssistant(req, res, user) {
  if (req.method !== "POST") return err(res, 405, "Method not allowed");
  if (!agent) return err(res, 503, "The AI assistant isn't set up yet. Ask your admin to add ANTHROPIC_API_KEY.");
  if (assistantLimited(user.email)) return err(res, 429, "You're sending messages quickly. Wait a few minutes and try again.");
  const body = await readJson(req, MAX_ASSISTANT_BODY);
  return agent.stream(req, res, user, body);
}

async function handleImages(req, res, user) {
  if (req.method !== "POST") return err(res, 405, "Method not allowed");
  if (!images) return err(res, 503, "No image generator is connected. Ask your admin to add OPENAI_API_KEY, or use the Prompt Builder with another tool.");
  if (imageLimited(user.email)) return err(res, 429, "You've generated a lot of images this hour. Try again later.");
  const body = await readJson(req);
  try {
    const src = await images.generate(body.prompt, ["square", "landscape", "portrait"].includes(body.aspect) ? body.aspect : "square");
    return sendJson(res, 200, { ok: true, src });
  } catch (e) {
    if (e.status) return err(res, e.status, e.message);
    throw e;
  }
}

/* ---------------- Static files ---------------- */
function serveFile(req, res, file, ext = path.extname(file).toLowerCase()) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": ext === ".html" || ext === ".js" || ext === ".css" ? "no-cache" : "public, max-age=86400",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function servePublic(req, res, rel) {
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  serveFile(req, res, file);
}

/* ---------------- Router ---------------- */
async function route(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end(); }

  if (pathname === "/api/health") return sendJson(res, 200, { ok: true });
  if (pathname.startsWith("/auth/")) return handleAuth(req, res, pathname);

  const user = await currentUser(req);
  if (pathname.startsWith("/api/")) {
    if (!user) return err(res, 401, "Sign in first");
    if (req.method !== "GET" && !sameOrigin(req)) return err(res, 403, "Origin not allowed");
    const [, , section, id] = pathname.split("/");
    if (section === "catalog" && req.method === "GET") return sendJson(res, 200, { ok: true, ...catalog.publicCatalog() });
    if (section === "config" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, assistant: !!agent, images: !!images, supportEmail: SUPPORT_EMAIL, user: publicUser(user) });
    }
    if (section === "designs" && pathname.split("/").length <= 4) return handleDesigns(req, res, id, user);
    if (section === "chats" && pathname.split("/").length <= 4) return handleChats(req, res, id, user);
    if (section === "tickets" && !id) return handleTickets(req, res, user);
    if (section === "assistant" && !id) return handleAssistant(req, res, user);
    if (section === "images" && !id) return handleImages(req, res, user);
    return err(res, 404, "Not found");
  }

  if (pathname === "/login" || pathname === "/login.html") {
    return user ? redirect(res, "/") : servePublic(req, res, "/login.html");
  }
  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const wantsPage = pathname.endsWith("/") || pathname.endsWith(".html");
    return wantsPage ? redirect(res, "/login") : err(res, 401, "Sign in first");
  }
  // The design rules are shared with the browser.
  if (pathname === "/js/design.js") return serveFile(req, res, path.join(__dirname, "lib", "design.js"));
  servePublic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  securityHeaders(res);
  route(req, res).catch(e => {
    if (e.status) return err(res, e.status, e.message);
    console.error(e);
    if (!res.headersSent) err(res, 500, "Server error");
  });
});
server.ready = store.init();

if (require.main === module) {
  server.ready.then(() => {
    server.listen(PORT, () => {
      console.log(`Kam Team Design Studio on http://localhost:${PORT}`);
      console.log(`Storage: ${store.kind}`);
      console.log(`Sign-in emails: ${mailer.kind}${mailer.kind === "console" ? " (codes are printed here; set RESEND_API_KEY or MAIL_WEBHOOK_URL)" : ""}`);
      if (mailer.kind === "none") console.warn("No email provider: nobody can sign in. Set RESEND_API_KEY or MAIL_WEBHOOK_URL.");
      if (!ALLOWED_EMAILS.length) console.warn("ALLOWED_EMAILS not set: only the first account can be created");
      console.log(agent ? `AI assistant: on (${agent.model})` : "AI assistant: off (set ANTHROPIC_API_KEY)");
      console.log(images ? `Image generation: on (${images.model})` : "Image generation: off (set OPENAI_API_KEY)");
    });
  }).catch(e => {
    console.error("Couldn't open storage:", e.message);
    process.exit(1);
  });
}

module.exports = server;
