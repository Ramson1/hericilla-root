-- Register (or re-register) the demo accounts for the CUSTOM auth system.
-- Run once in Supabase Dashboard → SQL Editor on project wjqjreiuahykuxyrugou.
--
-- The portals now authenticate against hericilla_profiles + hericilla_user_credentials
-- (bcrypt hashes verified by the auth-login Edge Function), NOT Supabase GoTrue.
-- Migration 0027 backfilled every profile with a hash that matches NO password and
-- must_reset = true — this script gives the six @hericilla.test accounts a real
-- password (Hericilla#2026) and clears the forced-reset flag.
--
-- Idempotent: safe to run repeatedly.

create extension if not exists pgcrypto with schema public;

do $$
declare
  r record;
  pid uuid;
begin
  for r in
    select * from (values
      ('admin@hericilla.test',       'Hericilla Admin',      'super_admin',          'EMP-001', '+2348010000001'),
      ('staff@hericilla.test',       'Hericilla Staff',      'warehouse_agent',      'EMP-002', '+2348010000002'),
      ('driver@hericilla.test',      'Hericilla Driver',     'driver',               'EMP-003', '+2348010000003'),
      ('supervisor@hericilla.test',  'Hericilla Supervisor', 'supervisor',           'EMP-004', '+2348010000004'),
      ('procurement@hericilla.test', 'Hericilla Procurement','procurement_officer',  'EMP-005', '+2348010000005'),
      ('finance@hericilla.test',     'Hericilla Finance',    'finance_officer',      'EMP-006', '+2348010000006')
    ) as t(email, full_name, role, employee_no, phone)
  loop
    -- upsert the profile (identity row; id is what auth.uid() resolves to)
    select id into pid from hericilla_profiles where lower(email) = lower(r.email) limit 1;
    if pid is null then
      insert into hericilla_profiles (id, full_name, email, role, status, employee_no, phone)
      values (gen_random_uuid(), r.full_name, r.email, r.role::hericilla_app_role, 'active', r.employee_no, r.phone)
      returning id into pid;
    else
      update hericilla_profiles
         set full_name = r.full_name,
             role      = r.role::hericilla_app_role,
             status    = 'active',
             employee_no = coalesce(employee_no, r.employee_no),
             phone       = coalesce(phone, r.phone)
       where id = pid;
    end if;

    -- upsert the credential row: bcrypt cost 10, no forced reset
    insert into hericilla_user_credentials (profile_id, password_hash, must_reset, updated_at)
    values (pid, crypt('Hericilla#2026', gen_salt('bf', 10)), false, now())
    on conflict (profile_id)
    do update set password_hash = excluded.password_hash,
                  must_reset    = false,
                  updated_at    = now();
  end loop;
end $$;

-- Give the demo driver plausible licence details for the driver app flows
update hericilla_profiles
   set license_number = coalesce(license_number, 'DG-DEMO-0001'),
       license_expiry = coalesce(license_expiry, date '2028-12-31'),
       home_base      = coalesce(home_base, 'Lagos HQ')
 where lower(email) = 'driver@hericilla.test';

-- Verify: all six rows must show status=active and must_reset=false
select p.email, p.role, p.status, c.must_reset, c.updated_at
from hericilla_profiles p
join hericilla_user_credentials c on c.profile_id = p.id
where p.email ilike '%@hericilla.test'
order by p.email;
