-- 0028 — flag non-employee service accounts.
--
-- A system account authenticates exactly like any other admin and EVERY write it makes is
-- still recorded in hericilla_audit_logs: this flag changes nothing about auditing. It only
-- keeps the account out of the People roster, staff/assignee/driver pickers, the inbox
-- recipient list and payroll runs, so an owner or automation login never looks like an
-- employee in operational screens. Account management (Settings → Users) still lists it.

alter table public.hericilla_profiles
  add column if not exists is_system boolean not null default false;

comment on column public.hericilla_profiles.is_system is
  'true = owner or automation service account: hidden from people rosters and pickers, still fully audited';

-- The owner console login registered under custom auth.
update public.hericilla_profiles
   set is_system = true
 where lower(email) = 'blackboxinfo01@gmail.com';
