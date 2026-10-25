// Kam Team Bible Study Guide — service worker.
// Keeps the app shell available offline and shows push reminders.
"use strict";

const CACHE = "kbs-v1";
const SHELL = ["/", "/app.js", "/curriculum.js", "/styles.css", "/icon.svg", "/kam-team-logo.png", "/manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so new releases show up straight away; the cache covers offline use.
// Sign-in and API calls always go to the network.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/login")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      // Only cache real pages, not the redirect to /login a signed-out visitor gets.
      if (r.ok && r.type === "basic" && !r.redirected) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("/")))
  );
});

self.addEventListener("push", e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(msg.title || "Kam Team Bible Study", {
    body: msg.body || "Time for today's study.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: msg.tag || "kbs",
    renotify: true,
    data: { url: msg.url || "/#today" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/#today", location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (new URL(c.url).origin === location.origin) { c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
