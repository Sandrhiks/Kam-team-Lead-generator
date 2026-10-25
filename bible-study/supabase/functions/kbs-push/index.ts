// Kam Team Bible Study Guide — kbs-push Edge Function (Supabase + GitHub Pages).
// One function, three actions, all POST {"action": ...}:
//   key   anyone      the public push key the app subscribes with
//   test  signed in   sends a test notification to the caller's devices
//   tick  pg_cron     sends every reminder due this minute (needs x-cron-secret)
// It reads and writes the kbs_* tables over its own database connection
// (SUPABASE_DB_URL), so Row Level Security keeps the browser out of them.
// Deploy with --no-verify-jwt: pg_cron calls it without a user token, and
// "test" checks the caller's token itself.

import postgres from "npm:postgres@3.4.9";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { dueReminders } from "./reminders.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// Only used as the apikey for checking a member's sign-in token.
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:team@kam-team.com";
const FUNCTION_URL = Deno.env.get("KBS_FUNCTION_URL") || `${SUPABASE_URL}/functions/v1/kbs-push`;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 3 });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Message = { title: string; body: string; url: string; tag: string };

/* ---------------- Setup ---------------- */
// Push keys are made once and kept in kbs_meta: new keys would cut off every
// device that already subscribed. Also records this function's URL, which the
// pg_cron job reads.
let setupDone: Promise<string> | null = null;
function setup(): Promise<string> {
  setupDone ??= (async () => {
    await sql`INSERT INTO public.kbs_meta (key, value) VALUES ('push_url', ${FUNCTION_URL})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    let [row] = await sql`SELECT value FROM public.kbs_meta WHERE key = 'vapid'`;
    if (!row) {
      await sql`INSERT INTO public.kbs_meta (key, value) VALUES ('vapid', ${JSON.stringify(webpush.generateVAPIDKeys())})
                ON CONFLICT (key) DO NOTHING`;
      [row] = await sql`SELECT value FROM public.kbs_meta WHERE key = 'vapid'`;
    }
    const keys = JSON.parse(row.value);
    webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
    return keys.publicKey as string;
  })().catch(e => { setupDone = null; throw e; });
  return setupDone;
}

/* ---------------- Sending ---------------- */
// Returns how many devices it reached. Devices the push service says are gone
// (404/410) are removed.
async function sendTo(subs: Sub[], msg: Message): Promise<number> {
  let n = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(msg), { TTL: 3600 });
      n++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sql`DELETE FROM public.kbs_push WHERE endpoint = ${sub.endpoint}`;
      else console.warn(`Push failed (${status ?? "network"}): ${(e as Error).message}`);
    }
  }
  return n;
}

// Records `key` as sent for this member. False if it was already there.
async function claim(userId: string, key: string): Promise<boolean> {
  const rows = await sql`INSERT INTO public.kbs_sent (user_id, key) VALUES (${userId}, ${key})
                         ON CONFLICT DO NOTHING RETURNING key`;
  return rows.length === 1;
}

async function tick(now = new Date()): Promise<number> {
  const rows = await sql`
    SELECT p.user_id, p.sub, g.data FROM public.kbs_push p
    JOIN public.kbs_progress g ON g.user_id = p.user_id`;
  const members = new Map<string, { data: unknown; subs: Sub[] }>();
  for (const r of rows) {
    if (!members.has(r.user_id)) members.set(r.user_id, { data: r.data, subs: [] });
    members.get(r.user_id)!.subs.push(r.sub);
  }
  let total = 0;
  for (const [userId, m] of members) {
    for (const due of dueReminders(m.data, now)) {
      if (!(await claim(userId, due.key))) continue;
      total += await sendTo(m.subs, { title: due.title, body: due.body, url: due.url, tag: due.key.split(":")[0] });
    }
  }
  await sql`DELETE FROM public.kbs_sent WHERE sent_at < now() - interval '3 days'`;
  return total;
}

/* ---------------- Requests ---------------- */
async function signedInUser(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }).auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Method not allowed" });
  const body = await req.json().catch(() => ({}));
  const publicKey = await setup();

  if (body.action === "key") return reply(200, { ok: true, publicKey });

  if (body.action === "tick") {
    const [row] = await sql`SELECT value FROM public.kbs_meta WHERE key = 'cron_secret'`;
    if (!row || req.headers.get("x-cron-secret") !== row.value) return reply(403, { ok: false, error: "Forbidden" });
    return reply(200, { ok: true, sent: await tick() });
  }

  if (body.action === "test") {
    const userId = await signedInUser(req);
    if (!userId) return reply(401, { ok: false, error: "Sign in first" });
    // One test per member every 5 minutes.
    if (!(await claim(userId, `test:${Math.floor(Date.now() / 300000)}`))) {
      return reply(429, { ok: false, error: "Wait a few minutes before sending another test." });
    }
    const subs = (await sql`SELECT sub FROM public.kbs_push WHERE user_id = ${userId}`).map(r => r.sub as Sub);
    const sent = await sendTo(subs, {
      title: "Reminders are on \u{2705}", body: "This is how your Bible study reminders will look.", url: "#today", tag: "test",
    });
    return sent ? reply(200, { ok: true, sent })
      : reply(404, { ok: false, error: "No device is subscribed yet. Turn on notifications first." });
  }

  return reply(400, { ok: false, error: "Unknown action" });
}

Deno.serve(req => handle(req).catch(e => {
  console.error(e);
  return reply(500, { ok: false, error: "Server error" });
}));
