-- 0027: Fully custom auth — decouple identity from Supabase GoTrue.
--
-- The portals stop using supabase.auth.* and instead authenticate against a custom
-- credentials table. A login Edge Function mints an HS256 JWT signed with the project's
-- JWT secret whose `sub` is the profile id, so PostgREST still resolves auth.uid() to the
-- profile and every existing RLS/RBAC policy keeps working with zero rewrites.
--
-- Idempotent — safe to run once in the SQL Editor.

-- 1. Decouple profiles from Supabase Auth. Profiles become the identity table; `id` stays
--    the value auth.uid() resolves to. Removing the FK lets us insert profiles directly.
alter table hericilla_profiles drop constraint if exists hericilla_profiles_id_fkey;

-- 2. Unique login index on the lower-cased email (one account per email).
create unique index if not exists uix_profiles_email on hericilla_profiles (lower(email));

-- 3. Credentials table — bcrypt hashes keyed to the profile. Never exposed to anon/authenticated.
create table if not exists hericilla_user_credentials (
  profile_id uuid primary key references hericilla_profiles(id) on delete cascade,
  password_hash text not null,
  must_reset boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 4. Password-reset tokens (hashed, single-use, expiring).
create table if not exists hericilla_password_resets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references hericilla_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5. Lock both tables down. Enable RLS with NO policies (deny-all for anon/authenticated) and
--    revoke table grants — only the service role (Edge Functions) touches them.
alter table hericilla_user_credentials enable row level security;
alter table hericilla_password_resets enable row level security;
revoke all on hericilla_user_credentials from anon, authenticated;
revoke all on hericilla_password_resets from anon, authenticated;

-- 6. Backfill existing active profiles so they have a credentials row. We insert a syntactically
--    valid bcrypt string that matches NO password and set must_reset = true, so nobody can sign
--    in until they complete the custom forgot-password flow.
insert into hericilla_user_credentials (profile_id, password_hash, must_reset)
select id, '$2a$10$0000000000000000000000000000000000000000000000000000', true
from hericilla_profiles
where status = 'active'
on conflict (profile_id) do nothing;

-- 7. The on_auth_user_created trigger (0002) is left in place; it simply never fires again because
--    we stop inserting rows into auth.users.
