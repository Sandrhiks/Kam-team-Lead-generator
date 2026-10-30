-- Kam Team Bible Study Guide: cell leaders, admins and two-step sign-in.
-- Run after pages.sql: Supabase → SQL Editor → New query → paste → Run. Safe to run again.
--
-- Roles: an admin makes members leaders (or admins). Each leader gets a cell
-- code; members enter it under Me → My cell leader to join that leader's cell.
-- Leaders see their members' progress on the Leader tab. Every leader and
-- admin function below checks that the session passed two-step sign-in
-- (Supabase "aal2"), so a stolen password alone can't open the dashboard.
--
-- Make yourself the first admin by running this once with your email:
--   INSERT INTO public.kbs_roles (user_id, role)
--     SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com'
--     ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

/* ---------------- Tables ---------------- */
CREATE TABLE IF NOT EXISTS public.kbs_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leader', 'admin')),
  code TEXT NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6)),
  created TIMESTAMPTZ NOT NULL DEFAULT now());

-- One row per member who joined a cell.
CREATE TABLE IF NOT EXISTS public.kbs_members (
  member_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  leader_id UUID NOT NULL REFERENCES public.kbs_roles (user_id) ON DELETE CASCADE,
  joined TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS kbs_members_leader ON public.kbs_members (leader_id);

ALTER TABLE public.kbs_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kbs_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kbs_roles, public.kbs_members FROM anon, authenticated;

/* ---------------- Helpers ---------------- */
-- True when this session passed two-step sign-in.
CREATE OR REPLACE FUNCTION public.kbs_aal2()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- The caller's role, but only if two-step sign-in was passed; otherwise an error.
CREATE OR REPLACE FUNCTION public.kbs_require_role(p_admin BOOLEAN)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r TEXT := (SELECT role FROM public.kbs_roles WHERE user_id = auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000'; END IF;
  IF r IS NULL OR (p_admin AND r <> 'admin') THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT public.kbs_aal2() THEN RAISE EXCEPTION 'two-step sign-in required' USING ERRCODE = '42501'; END IF;
  RETURN r;
END $$;

/* ---------------- Everyone ---------------- */
-- { role, code, leader: { name } }. The cell code is shown only after two-step sign-in.
CREATE OR REPLACE FUNCTION public.kbs_me()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'role', (SELECT role FROM public.kbs_roles WHERE user_id = auth.uid()),
    'code', CASE WHEN public.kbs_aal2() THEN (SELECT code FROM public.kbs_roles WHERE user_id = auth.uid()) END,
    'leader', (SELECT jsonb_build_object('name', coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)))
               FROM public.kbs_members m JOIN auth.users u ON u.id = m.leader_id
               WHERE m.member_id = auth.uid()));
$$;

-- Joins the cell that owns this code. Returns the leader's name.
CREATE OR REPLACE FUNCTION public.kbs_join_leader(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  lid UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000'; END IF;
  SELECT user_id INTO lid FROM public.kbs_roles WHERE code = upper(btrim(coalesce(p_code, '')));
  IF lid IS NULL THEN RAISE EXCEPTION 'unknown code' USING ERRCODE = '22023'; END IF;
  IF lid = uid THEN RAISE EXCEPTION 'that is your own code' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.kbs_members (member_id, leader_id) VALUES (uid, lid)
  ON CONFLICT (member_id) DO UPDATE SET leader_id = EXCLUDED.leader_id, joined = now();
  RETURN (SELECT jsonb_build_object('name', coalesce(nullif(raw_user_meta_data ->> 'name', ''), split_part(email, '@', 1)))
          FROM auth.users WHERE id = lid);
END $$;

CREATE OR REPLACE FUNCTION public.kbs_leave_leader()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.kbs_members WHERE member_id = auth.uid();
$$;

/* ---------------- Leaders ---------------- */
-- The caller's members with a progress summary (not their answers or journal).
CREATE OR REPLACE FUNCTION public.kbs_my_members()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.kbs_require_role(false);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'name', coalesce(u.raw_user_meta_data ->> 'name', ''),
      'email', u.email,
      'joined', (extract(epoch FROM m.joined) * 1000)::BIGINT,
      'updated', p.updated,
      'streak', CASE WHEN jsonb_typeof(p.data -> 'streak') = 'number' THEN (p.data ->> 'streak')::NUMERIC::INT ELSE 0 END,
      'done', CASE WHEN jsonb_typeof(p.data -> 'lessons') = 'object' THEN coalesce(
                (SELECT jsonb_agg(e.key) FROM jsonb_each(p.data -> 'lessons') e
                 WHERE jsonb_typeof(e.value) = 'object' AND jsonb_typeof(e.value -> 'done') = 'number'
                   AND (e.value ->> 'done')::NUMERIC > 0), '[]'::JSONB) ELSE '[]'::JSONB END,
      'read', CASE WHEN jsonb_typeof(p.data -> 'reading' -> 'done') = 'object'
                THEN (SELECT count(*) FROM jsonb_object_keys(p.data -> 'reading' -> 'done')) ELSE 0 END
    ) ORDER BY p.updated DESC NULLS LAST), '[]'::JSONB)
    FROM public.kbs_members m
    JOIN auth.users u ON u.id = m.member_id
    LEFT JOIN public.kbs_progress p ON p.user_id = m.member_id
    WHERE m.leader_id = auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.kbs_remove_member(p_member UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.kbs_require_role(false);
  DELETE FROM public.kbs_members WHERE member_id = p_member AND leader_id = auth.uid();
END $$;

/* ---------------- Admins ---------------- */
-- Leaders and admins with their member counts.
CREATE OR REPLACE FUNCTION public.kbs_team()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.kbs_require_role(true);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'email', u.email,
      'name', coalesce(u.raw_user_meta_data ->> 'name', ''),
      'role', r.role,
      'members', (SELECT count(*) FROM public.kbs_members m WHERE m.leader_id = r.user_id),
      'twoStep', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = r.user_id AND f.status = 'verified'),
      'self', r.user_id = auth.uid()
    ) ORDER BY r.role, u.email), '[]'::JSONB)
    FROM public.kbs_roles r JOIN auth.users u ON u.id = r.user_id);
END $$;

-- Gives a member the role 'leader' or 'admin', or removes it (p_role NULL).
-- Removing a leader also releases their members, who can then join another cell.
CREATE OR REPLACE FUNCTION public.kbs_set_role(p_email TEXT, p_role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target UUID;
BEGIN
  PERFORM public.kbs_require_role(true);
  IF p_role IS NOT NULL AND p_role NOT IN ('leader', 'admin') THEN
    RAISE EXCEPTION 'role must be leader or admin' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(btrim(coalesce(p_email, '')));
  IF target IS NULL THEN RAISE EXCEPTION 'no account with that email' USING ERRCODE = '22023'; END IF;
  IF target = auth.uid() THEN RAISE EXCEPTION 'you can''t change your own role' USING ERRCODE = '22023'; END IF;
  IF p_role IS NULL THEN
    DELETE FROM public.kbs_roles WHERE user_id = target;
  ELSE
    INSERT INTO public.kbs_roles (user_id, role) VALUES (target, p_role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
END $$;

/* ---------------- Who can call what ---------------- */
REVOKE EXECUTE ON FUNCTION public.kbs_aal2(), public.kbs_require_role(BOOLEAN), public.kbs_me(),
  public.kbs_join_leader(TEXT), public.kbs_leave_leader(), public.kbs_my_members(),
  public.kbs_remove_member(UUID), public.kbs_team(), public.kbs_set_role(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kbs_me(), public.kbs_join_leader(TEXT), public.kbs_leave_leader(),
  public.kbs_my_members(), public.kbs_remove_member(UUID), public.kbs_team(),
  public.kbs_set_role(TEXT, TEXT) TO authenticated;
-- kbs_aal2 and kbs_require_role run inside the functions above, as their owner.
