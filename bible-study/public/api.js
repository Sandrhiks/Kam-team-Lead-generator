// Kam Team Bible Study Guide — backend adapter.
// The app and sign-in page call window.KBS for accounts, progress and push.
// Two backends answer the same calls:
//   - "server":   bible-study/server.js (cookies, /auth/* and /api/*)
//   - "supabase": Supabase Auth, tables guarded by Row Level Security, and the
//                 kbs-push Edge Function (used when the app is on GitHub Pages)
// Network failures throw, so callers can fall back to the copy on the device.
(function () {
  "use strict";
  const cfg = window.KBS_CONFIG || {};
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";
  const json = r => r.json().catch(() => ({}));
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

  /* ---------------- Node server ---------------- */
  const server = {
    mode: "server",
    ready: Promise.resolve(),
    async me() {
      const r = await fetch("auth/me");
      if (r.status === 401) return null;
      const j = await json(r);
      return { email: j.email, name: j.name };
    },
    async login(email, password) {
      const r = await post("auth/login", { email, password });
      const j = await json(r);
      return r.ok && j.ok ? { ok: true } : { ok: false, error: j.error };
    },
    async signup(name, email, password) {
      const r = await post("auth/signup", { name, email, password });
      const j = await json(r);
      return r.ok && j.ok ? { ok: true } : { ok: false, error: j.error };
    },
    async logout() { await post("auth/logout").catch(() => {}); },
    // { data, updated }, or null when signed out.
    async getProgress() {
      const r = await fetch("api/progress");
      if (r.status === 401) return null;
      if (!r.ok) throw new Error("progress " + r.status);
      const j = await json(r);
      return { data: j.data, updated: j.updated || 0 };
    },
    // { status: "ok" | "conflict" | "signedOut", data, updated }
    async putProgress(data, updated) {
      const r = await fetch("api/progress", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, updated }),
      });
      if (r.status === 401) return { status: "signedOut" };
      if (r.status === 409) { const j = await json(r); return { status: "conflict", data: j.data, updated: j.updated }; }
      return { status: "ok" };
    },
    async pushKey() { return (await json(await fetch("api/push/key"))).publicKey; },
    async subscribe(sub) { return (await post("api/push/subscribe", { subscription: sub })).ok; },
    async unsubscribe(endpoint) { await post("api/push/unsubscribe", { endpoint }); },
    async testPush() {
      const r = await post("api/push/test");
      const j = await json(r);
      return r.ok ? { ok: true } : { ok: false, error: j.error };
    },
  };

  /* ---------------- Supabase ---------------- */
  function supabaseBackend() {
    let sb = null;
    const ready = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SUPABASE_JS;
      s.crossOrigin = "anonymous";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Couldn't load Supabase"));
      document.head.appendChild(s);
    }).then(async () => {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      // Finishes a sign-in from an email link, then clears its tokens from the address bar.
      await sb.auth.getSession();
      if (/access_token=|error_description=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    });
    // Keep the rejection from surfacing as "unhandled"; each call awaits ready and sees it.
    ready.catch(() => {});

    const signedOut = e => e && (e.status === 401 || e.code === "PGRST301" || e.code === "28000" || /JWT|not signed in/i.test(e.message || ""));
    const fail = e => { const err = new Error(e.message || "Request failed"); err.cause = e; return err; };

    async function fn(body) {
      const { data, error } = await sb.functions.invoke("kbs-push", { body });
      if (!error) return { ok: true, data };
      let j = {};
      try { j = await error.context.json(); } catch { /* not JSON */ }
      return { ok: false, error: j.error || error.message };
    }

    const authError = (e, fallback) => {
      const m = (e && e.message) || "";
      if (/invalid login credentials/i.test(m)) return "Email or password is incorrect.";
      if (/email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent you.";
      if (/already registered|already exists/i.test(m)) return "An account with this email already exists. Sign in instead.";
      if (/signups not allowed|signup is disabled/i.test(m)) return "New sign-ups are closed. Ask your cell leader or church admin.";
      if (/rate limit|too many/i.test(m)) return "Too many attempts. Wait a few minutes and try again.";
      if (/password/i.test(m)) return m;
      return fallback;
    };

    return {
      mode: "supabase",
      ready,
      async me() {
        await ready;
        const { data, error } = await sb.auth.getSession();
        if (error && !navigator.onLine) throw fail(error);
        const u = data.session && data.session.user;
        return u ? { email: u.email, name: (u.user_metadata && u.user_metadata.name) || "" } : null;
      },
      async login(email, password) {
        await ready;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return error ? { ok: false, error: authError(error, "Couldn't sign in. Try again.") } : { ok: true };
      },
      async signup(name, email, password) {
        await ready;
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { data: { name }, emailRedirectTo: new URL("./", location.href).href },
        });
        if (error) return { ok: false, error: authError(error, "Couldn't create the account. Try again.") };
        // With "Confirm email" on, there's no session until the link is opened.
        // Supabase also answers this way for an address that already has an account.
        return data.session ? { ok: true } : { ok: true, confirm: true };
      },
      async logout() { await ready; await sb.auth.signOut().catch(() => {}); },
      async getProgress() {
        await ready;
        const { data, error } = await sb.from("kbs_progress").select("data, updated").maybeSingle();
        if (error) { if (signedOut(error)) return null; throw fail(error); }
        return data ? { data: data.data, updated: Number(data.updated) } : { data: null, updated: 0 };
      },
      async putProgress(data, updated) {
        await ready;
        const { data: r, error } = await sb.rpc("kbs_save_progress", { p_data: data, p_updated: updated });
        if (error) { if (signedOut(error)) return { status: "signedOut" }; throw fail(error); }
        return r.saved ? { status: "ok" } : { status: "conflict", data: r.data, updated: Number(r.updated) };
      },
      async pushKey() {
        await ready;
        const r = await fn({ action: "key" });
        if (!r.ok) throw new Error(r.error);
        return r.data.publicKey;
      },
      async subscribe(sub) {
        await ready;
        const { error } = await sb.rpc("kbs_add_push", { p_sub: sub });
        return !error;
      },
      async unsubscribe(endpoint) { await ready; await sb.rpc("kbs_remove_push", { p_endpoint: endpoint }); },
      async testPush() { await ready; return fn({ action: "test" }); },
    };
  }

  const api = cfg.supabaseUrl && cfg.supabaseKey ? supabaseBackend() : server;
  api.loginUrl = "login.html";
  api.homeUrl = "./";
  window.KBS = api;
})();
