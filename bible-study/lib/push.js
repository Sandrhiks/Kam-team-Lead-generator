"use strict";

// Web Push with no extra dependencies: VAPID signing (RFC 8292) and
// aes128gcm payload encryption (RFC 8291), using only node:crypto.
// Works with Chrome, Edge, Firefox and Safari (iOS 16.4+ once the app is
// added to the Home Screen).

const crypto = require("node:crypto");

const b64u = buf => Buffer.from(buf).toString("base64url");
const unb64u = s => Buffer.from(String(s || ""), "base64url");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/* ---------------- VAPID keys ---------------- */
// Changing the keys invalidates every existing subscription, so the server
// generates them once and keeps them (see initVapid in server.js).
function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  return { publicKey: b64u(rawPublic(publicKey)), privateKey: jwk.d };
}

function rawPublic(keyObject) {
  const jwk = keyObject.export({ format: "jwk" });
  return Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
}

function vapidFrom(publicKey, privateKey) {
  const pub = unb64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 key");
  const key = crypto.createPrivateKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) },
  });
  return { publicKey, key };
}

function vapidHeader(vapid, endpoint, subject) {
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  }));
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), { key: vapid.key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

/* ---------------- Payload encryption (RFC 8291) ---------------- */
function encrypt(subscription, payload, { salt = crypto.randomBytes(16), ecdh } = {}) {
  const uaPublic = unb64u(subscription.keys && subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys && subscription.keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("Invalid subscription keys");

  if (!ecdh) { ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys(); }
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Inverse of encrypt, for the receiving side. Only used by tests.
function decrypt(uaEcdh, authSecret, record) {
  const salt = record.subarray(0, 16);
  const idLen = record[20];
  const asPublic = record.subarray(21, 21 + idLen);
  const data = record.subarray(21 + idLen);
  const uaPublic = uaEcdh.getPublicKey();
  const shared = uaEcdh.computeSecret(asPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString("utf8");
}

/* ---------------- Sending ---------------- */
// Returns { ok, status, gone }. `gone` means the browser dropped the
// subscription (404/410) and it should be deleted.
async function send(vapid, subject, subscription, message, ttl = 6 * 3600) {
  const body = encrypt(subscription, JSON.stringify(message));
  const r = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeader(vapid, subscription.endpoint, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  return { ok: r.ok, status: r.status, gone: r.status === 404 || r.status === 410 };
}

function validSubscription(sub) {
  if (!sub || typeof sub !== "object") return false;
  let url;
  try { url = new URL(sub.endpoint); } catch { return false; }
  return url.protocol === "https:" && sub.endpoint.length <= 1024 &&
    unb64u(sub.keys && sub.keys.p256dh).length === 65 && unb64u(sub.keys && sub.keys.auth).length === 16;
}

module.exports = { vapidFrom, generateVapidKeys, vapidHeader, encrypt, decrypt, send, validSubscription };
