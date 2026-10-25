-- 0002: Core identity — departments, profiles, role permissions, settings, sites

-- departments first (head FK added after profiles exists)
create table if not exists hericilla_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists hericilla_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role hericilla_app_role not null default 'staff',
  department_id uuid references hericilla_departments(id),
  employee_no text unique,
  avatar_url text,
  home_base text,
  status text not null default 'active' check (status in ('active','inactive')),
  license_number text,
  license_expiry date,
  employed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hericilla_departments add column if not exists head_profile_id uuid references hericilla_profiles(id);

-- ===== RBAC helpers (SECURITY DEFINER to avoid RLS recursion) =====
-- Defined here rather than in 0001 because these bodies are `language sql`: PostgreSQL parses and
-- plans them at CREATE FUNCTION time, so hericilla_profiles has to exist first. Every policy in later
-- migrations calls them, so they must stay ahead of any create policy.
create or replace function public.hericilla_current_role_name()
returns hericilla_app_role language sql stable security definer set search_path = public as
$$ select role from hericilla_profiles where id = auth.uid() $$;

create or replace function public.hericilla_current_dept_id()
returns uuid language sql stable security definer set search_path = public as
$$ select department_id from hericilla_profiles where id = auth.uid() $$;

-- hericilla_has_role('admin','supervisor') → true when the signed-in user has any listed role
create or replace function public.hericilla_has_role(variadic roles text[])
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from hericilla_profiles p
     where p.id = auth.uid() and p.status = 'active'
       and p.role::text = any(roles)
   ) $$;

create or replace function public.hericilla_is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select public.hericilla_has_role('super_admin','admin') $$;

-- Officers who manage day-to-day operations (not just super users)
create or replace function public.hericilla_is_ops()
returns boolean language sql stable security definer set search_path = public as
$$ select public.hericilla_has_role('super_admin','admin','supervisor','logistics_officer','procurement_officer','finance_officer','hr_officer') $$;

create or replace function public.hericilla_is_driver()
returns boolean language sql stable security definer set search_path = public as
$$ select public.hericilla_has_role('driver') $$;

create table if not exists hericilla_role_permissions (
  role hericilla_app_role not null,
  resource text not null,          -- e.g. 'clients','invoices','payroll'
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_approve boolean not null default false,
  can_export boolean not null default false,
  can_delete boolean not null default false,
  primary key (role, resource)
);

create table if not exists hericilla_app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  radius_m integer not null default 300,   -- geofence radius
  kind text not null default 'office' check (kind in ('office','operational','client')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when an auth user is added (admin invite flow)
create or replace function public.hericilla_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.hericilla_profiles (id, full_name, email, role, department_id, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::hericilla_app_role, 'staff'),
    nullif(new.raw_user_meta_data->>'department_id','')::uuid,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.hericilla_handle_new_user();

-- Default settings
insert into hericilla_app_settings (key, value, description) values
  ('geofence_radius_m', '300', 'Default GPS check radius in metres'),
  ('attendance_grace_minutes', '15', 'Minutes after shift start before an arrival is late'),
  ('overtime_multiplier', '1.5', 'Hourly pay multiplier for approved overtime'),
  ('overtime_weekly_cap_hours', '12', 'Maximum overtime hours per week'),
  ('gps_retention_days', '180', 'Days to keep raw GPS coordinates'),
  ('company_email', '"Hericilla Support Services <no-reply@hericilla.ng>"'::jsonb, 'Sender address for emails'),
  ('notify_admin_roles', '["super_admin","admin"]', 'Roles that receive operational alerts')
on conflict (key) do nothing;
