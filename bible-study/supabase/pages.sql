-- Kam Team Bible Study Guide on GitHub Pages + Supabase: database setup.
-- Paste this into Supabase → SQL Editor → New query → Run. Safe to run again.
--
-- Members sign in with Supabase Auth. Each member can read only their own
-- progress, and every write goes through the functions below, which check who
-- is signed in. The kbs-push Edge Function sends reminders: pg_cron calls it
-- once a minute, and it reads the tables over its own database connection.
-- (setup.sql is for the Node server version instead; you don't need both.)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

/* ---------------- Tables ---------------- */
-- One JSON document per member: lessons, journal, prayers, settings...
CREATE TABLE IF NOT EXISTS public.kbs_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated BIGINT NOT NULL);

-- One row per device that turned reminders on.
CREATE TABLE IF NOT EXISTS public.kbs_push (
  endpoint TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sub JSONB NOT NULL,
  created BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS kbs_push_user ON public.kbs_push (user_id);

-- Reminders already sent ("daily:2026-10-25"), so each goes out once.
CREATE TABLE IF NOT EXISTS public.kbs_sent (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key));

-- App settings: the push keys, the reminder function's URL and the secret
-- that lets pg_cron call it. Filled in by the function on its first run.
CREATE TABLE IF NOT EXISTS public.kbs_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO public.kbs_meta (key, value)
  VALUES ('cron_secret', replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', ''))
  ON CONFLICT (key) DO NOTHING;

/* ---------------- Access ---------------- */
ALTER TABLE public.kbs_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kbs_push     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kbs_sent     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kbs_meta     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kbs_progress, public.kbs_push, public.kbs_sent, public.kbs_meta FROM anon, authenticated;
GRANT SELECT ON public.kbs_progress TO authenticated;

DROP POLICY IF EXISTS kbs_progress_own ON public.kbs_progress;
CREATE POLICY kbs_progress_own ON public.kbs_progress
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

/* ---------------- Functions the app calls ---------------- */
-- Saves progress unless the stored copy is newer; then returns that copy so
-- the device can switch to it (the same rule as the Node server).
CREATE OR REPLACE FUNCTION public.kbs_save_progress(p_data JSONB, p_updated BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  n INT;
  cur public.kbs_progress%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000'; END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'data must be an object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_data::TEXT) > 2 * 1024 * 1024 THEN
    RAISE EXCEPTION 'progress is too large' USING ERRCODE = '22023';
  END IF;
  IF p_updated IS NULL OR p_updated <= 0 OR p_updated > (extract(epoch FROM now()) * 1000)::BIGINT + 86400000 THEN
    RAISE EXCEPTION 'updated must be a recent timestamp' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kbs_progress (user_id, data, updated) VALUES (uid, p_data, p_updated)
  ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated = EXCLUDED.updated
    WHERE public.kbs_progress.updated <= EXCLUDED.updated;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN RETURN jsonb_build_object('saved', true, 'updated', p_updated); END IF;

  SELECT * INTO cur FROM public.kbs_progress WHERE user_id = uid;
  RETURN jsonb_build_object('saved', false, 'data', cur.data, 'updated', cur.updated);
END $$;

-- Registers this device for reminders; keeps a member's newest 10 devices.
CREATE OR REPLACE FUNCTION public.kbs_add_push(p_sub JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  ep TEXT := p_sub ->> 'endpoint';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000'; END IF;
  IF ep IS NULL OR ep !~ '^https://' OR length(ep) > 2000
     OR jsonb_typeof(p_sub -> 'keys' -> 'p256dh') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_sub -> 'keys' -> 'auth') IS DISTINCT FROM 'string'
     OR length(p_sub -> 'keys' ->> 'p256dh') > 200 OR length(p_sub -> 'keys' ->> 'auth') > 100 THEN
    RAISE EXCEPTION 'invalid subscription' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kbs_push (endpoint, user_id, sub, created)
  VALUES (ep, uid,
          jsonb_build_object('endpoint', ep, 'keys', jsonb_build_object(
            'p256dh', p_sub -> 'keys' ->> 'p256dh', 'auth', p_sub -> 'keys' ->> 'auth')),
          (extract(epoch FROM now()) * 1000)::BIGINT)
  ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, sub = EXCLUDED.sub;

  DELETE FROM public.kbs_push WHERE user_id = uid AND endpoint NOT IN
    (SELECT endpoint FROM public.kbs_push WHERE user_id = uid ORDER BY created DESC LIMIT 10);
END $$;

CREATE OR REPLACE FUNCTION public.kbs_remove_push(p_endpoint TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.kbs_push WHERE endpoint = p_endpoint AND user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.kbs_save_progress(JSONB, BIGINT), public.kbs_add_push(JSONB),
  public.kbs_remove_push(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kbs_save_progress(JSONB, BIGINT), public.kbs_add_push(JSONB),
  public.kbs_remove_push(TEXT) TO authenticated;

/* ---------------- Reminders, once a minute ---------------- */
-- Calls the kbs-push Edge Function. Until the function has run once (the
-- GitHub workflow does that right after deploying it), its URL isn't known
-- yet and this does nothing.
CREATE OR REPLACE FUNCTION public.kbs_cron_tick()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fn_url TEXT := (SELECT value FROM public.kbs_meta WHERE key = 'push_url');
BEGIN
  IF fn_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.kbs_meta WHERE key = 'cron_secret')),
    body := '{"action":"tick"}'::JSONB,
    timeout_milliseconds := 55000);
END $$;
REVOKE EXECUTE ON FUNCTION public.kbs_cron_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('kbs-reminders', '* * * * *', 'SELECT public.kbs_cron_tick()');
