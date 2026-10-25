-- Kam Team Bible Study Guide: Supabase setup.
-- Paste this into Supabase → SQL Editor → New query → Run. Safe to run again.
--
-- The app creates these tables itself on first start, so this script is
-- mostly about locking them down. Supabase publishes every table in the
-- "public" schema through its Data API, where anyone holding the project's
-- public "anon" key could read them, including password hashes. Row Level
-- Security with no policies closes that door. The app connects as the
-- "postgres" user, which bypasses RLS, so it keeps working.

CREATE TABLE IF NOT EXISTS kam_users (
  email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL, created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS bible_progress (
  email TEXT PRIMARY KEY, data JSONB NOT NULL, updated BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS bible_push (
  endpoint TEXT PRIMARY KEY, email TEXT NOT NULL, sub JSONB NOT NULL, created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS bible_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

ALTER TABLE kam_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_push     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_meta     ENABLE ROW LEVEL SECURITY;

-- Belt and braces: take the Data API roles' grants away too.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON kam_users, bible_progress, bible_push, bible_meta FROM %I', r);
    END IF;
  END LOOP;
END $$;
