"use strict";

// One-time sign-in codes (OTP) sent by email.
// - 6 digits from a CSPRNG, valid for OTP_MINUTES (default 10)
// - stored only as an HMAC, never in plain text
// - 5 wrong guesses burns the code; a new one can be requested after a short cooldown

const crypto = require("node:crypto");

const DIGITS = 6;
const MAX_TRIES = 5;
const RESEND_SECONDS = 30;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createOtp({ store, secret, minutes = 10, mailer }) {
  const hash = (email, code) => crypto.createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");

  // Returns { ok: true } or { ok: false, status, error }.
  async function issue(email, now = Date.now()) {
    const cur = await store.getCode(email);
    if (cur && now - cur.sent < RESEND_SECONDS * 1000) {
      const wait = Math.ceil((RESEND_SECONDS * 1000 - (now - cur.sent)) / 1000);
      return { ok: false, status: 429, error: `Wait ${wait} seconds before asking for another code.` };
    }
    const code = String(crypto.randomInt(0, 10 ** DIGITS)).padStart(DIGITS, "0");
    await store.putCode({ email, hash: hash(email, code), exp: now + minutes * 60000, tries: 0, sent: now });
    try {
      await mailer.send({
        to: email,
        subject: `${code} is your Kam Team Design Studio code`,
        text: `Your Kam Team Design Studio sign-in code is ${code}.\n\nIt expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
        html: codeEmail(code, minutes),
        code,
      });
    } catch (e) {
      await store.deleteCode(email);
      console.warn("Couldn't send sign-in code:", e.message);
      return { ok: false, status: 502, error: "We couldn't send the email. Try again in a minute." };
    }
    return { ok: true };
  }

  // Returns { ok: true } or { ok: false, status, error }.
  async function check(email, code, now = Date.now()) {
    const rec = await store.getCode(email);
    const generic = { ok: false, status: 401, error: "That code is wrong or has expired. Check the email or ask for a new code." };
    if (!rec || rec.exp < now || rec.tries >= MAX_TRIES) return generic;
    const given = String(code || "").replace(/\D/g, "");
    const a = Buffer.from(hash(email, given)), b = Buffer.from(rec.hash);
    if (given.length === DIGITS && a.length === b.length && crypto.timingSafeEqual(a, b)) {
      await store.deleteCode(email);
      return { ok: true };
    }
    rec.tries++;
    if (rec.tries >= MAX_TRIES) {
      await store.deleteCode(email);
      return { ok: false, status: 401, error: "Too many wrong codes. Ask for a new one." };
    }
    await store.putCode(rec);
    return generic;
  }

  return { issue, check, minutes };
}

function codeEmail(code, minutes) {
  return `<!doctype html><html><body style="margin:0;background:#F2F2F0;font-family:Arial,Helvetica,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="420" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E1E1DD;border-radius:12px">
<tr><td style="background:#111;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;font-weight:800;letter-spacing:.16em">KAM TEAM <span style="font-weight:400;letter-spacing:0;color:#9C9C98">Design Studio</span></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px">Your sign-in code:</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:800;letter-spacing:.3em">${code}</p>
<p style="margin:0;font-size:13px;color:#62625E">It expires in ${minutes} minutes. If you didn't ask for it, ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

/* ---------------- Mailer ---------------- */
// Sends email through Resend (RESEND_API_KEY), or posts it to a webhook you own
// (MAIL_WEBHOOK_URL, e.g. a GoHighLevel, n8n or Zapier workflow that sends the email).
// With neither, codes are printed to the server log, which is only allowed outside production.
function createMailer({ resendKey, from, webhookUrl, production }) {
  if (resendKey) {
    return {
      kind: "resend",
      async send({ to, subject, text, html }) {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error(`Resend replied ${r.status}`);
      },
    };
  }
  if (webhookUrl) {
    return {
      kind: "webhook",
      async send({ to, subject, text, html, code }) {
        const r = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, subject, text, html, code, app: "kam-team-design-studio" }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error(`Mail webhook replied ${r.status}`);
      },
    };
  }
  return {
    kind: production ? "none" : "console",
    async send({ to, subject, text }) {
      if (production) throw new Error("No email provider is set up (RESEND_API_KEY or MAIL_WEBHOOK_URL)");
      console.log(`\n[dev email] to ${to}: ${subject}\n${text}\n`);
    },
  };
}

module.exports = { createOtp, createMailer, normalizeEmail, validEmail, DIGITS, MAX_TRIES };
