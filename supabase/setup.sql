-- Kam Team Lead Generator: Supabase setup.
-- Paste this into Supabase → SQL Editor → New query → Run. Safe to run again.
--
-- The app creates these tables itself on first start, so this script is
-- mostly about locking them down. Supabase publishes every table in the
-- "public" schema through its Data API, where anyone holding the project's
-- public "anon" key could read them, including password hashes and leads.
-- Row Level Security with no policies closes that door. The app connects as
-- the "postgres" user, which bypasses RLS, so it keeps working.

CREATE TABLE IF NOT EXISTS kam_users (
  email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL, created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS kam_leads (
  owner TEXT NOT NULL, id TEXT NOT NULL, updated BIGINT NOT NULL, data JSONB NOT NULL,
  PRIMARY KEY (owner, id));

ALTER TABLE kam_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE kam_leads ENABLE ROW LEVEL SECURITY;

-- Belt and braces: take the Data API roles' grants away too.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON kam_users, kam_leads FROM %I', r);
    END IF;
  END LOOP;
END $$;
