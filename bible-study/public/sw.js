// Kam Team Bible Study Guide — service worker.
// Keeps the app shell available offline and shows push reminders.
// Paths are relative to this file, so the app works at a domain's root (the
// Node server) or in a folder (GitHub Pages: /<repo>/).
"use strict";

const CACHE = "kbs-v3";
const SHELL = ["./", "app.js", "api.js", "config.js", "curriculum.js", "styles.css", "icon.svg", "kam-team-logo.png", "manifest.webmanifest"];
const SCOPE = new URL("./", self.location).pathname;
// The Supabase client library, loaded from a CDN when the app uses Supabase.
const LIBS = "https://cdn.jsdelivr.net/npm/@supabase/";

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
  if (e.request.method !== "GET") return;
  if (url.href.startsWith(LIBS)) {
    // Version-pinned, so the cached copy never goes stale.
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  const rel = url.pathname.startsWith(SCOPE) ? url.pathname.slice(SCOPE.length) : url.pathname;
  if (rel.startsWith("api/") || rel.startsWith("auth/") || rel.startsWith("login")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      // Only cache real pages, not the redirect to the sign-in page a signed-out visitor gets.
      if (r.ok && r.type === "basic" && !r.redirected) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./")))
  );
});

// Links in a push ("/#today" from the Node server, "#today" from Supabase)
// open inside the app's folder.
const appUrl = u => new URL(String(u || "#today").replace(/^\//, ""), self.registration.scope).href;

self.addEventListener("push", e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(msg.title || "Kam Team Bible Study", {
    body: msg.body || "Time for today's study.",
    icon: "icon.svg",
    badge: "icon.svg",
    tag: msg.tag || "kbs",
    renotify: true,
    data: { url: appUrl(msg.url) },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = appUrl(e.notification.data && e.notification.data.url);
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
