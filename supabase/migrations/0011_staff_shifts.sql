-- 0011: Staff details, licences, shifts & scheduling

create table if not exists hericilla_staff_details (
  profile_id uuid primary key references hericilla_profiles(id) on delete cascade,
  grade text,
  next_of_kin_name text,
  next_of_kin_phone text,
  bank_name text,
  bank_account_name text,
  bank_account_no text,
  pension_pin text,
  hr_notes text,
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_staff_certifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references hericilla_profiles(id) on delete cascade,
  name text not null,                       -- licence class, safety training, ISO cert…
  issued_by text,
  issued_at date,
  expiry_date date,
  document_url text,
  status text not null default 'valid' check (status in ('valid','expired','renewed')),
  created_at timestamptz not null default now()
);

create table if not exists hericilla_shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  break_mins integer not null default 60,
  default_site_id uuid references hericilla_sites(id),
  created_at timestamptz not null default now()
);

create table if not exists hericilla_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references hericilla_shifts(id),
  employee_id uuid not null references hericilla_profiles(id) on delete cascade,
  work_date date not null,
  site_id uuid references hericilla_sites(id),
  work_order_id uuid references hericilla_work_orders(id),
  note text,
  created_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date, shift_id)
);

create index if not exists idx_sa_date on hericilla_shift_assignments (work_date);
create index if not exists idx_sa_emp_date on hericilla_shift_assignments (employee_id, work_date);
create index if not exists idx_cert_expiry on hericilla_staff_certifications (expiry_date) where status = 'valid';
