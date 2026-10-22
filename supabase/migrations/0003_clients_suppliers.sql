-- 0003: Clients & suppliers

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rc_number text,
  address text,
  city text default 'Port Harcourt',
  email text,
  phone text,
  billing_terms text,
  logo_url text,
  notes text,
  deleted_at timestamptz,           -- soft delete = undo support
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  full_name text not null,
  job_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists client_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  sla_terms text,
  start_date date,
  end_date date,
  document_url text,
  status text not null default 'active' check (status in ('active','expired','terminated')),
  created_at timestamptz not null default now()
);

create table if not exists client_pricing (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  service_type service_type not null,
  rate numeric(14,2) not null check (rate >= 0),
  unit text not null default 'job',      -- job | trip | ton | hour | day
  valid_from date not null default current_date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists client_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  invoice_id uuid,                        -- FK added in 0010 once invoices exist
  amount numeric(14,2) not null check (amount >= 0),
  method text not null default 'transfer',
  paid_at date not null default current_date,
  reference text,
  note text,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rc_number text,
  category supplier_category not null default 'other',
  products_services text,
  address text,
  email text,
  phone text,
  payment_terms text,
  lead_time_days integer,
  status text not null default 'prospective' check (status in ('approved','prospective','suspended')),
  delivery_score numeric(4,2) default 0,   -- 0..5, updated on GRN
  quality_score numeric(4,2) default 0,
  reliability_score numeric(4,2) default 0,
  notes text,
  deleted_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists supplier_contracts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  title text not null,
  document_url text,
  certificate_type text,                   -- e.g. insurance, ISO, NUPRC permit
  start_date date,
  expiry_date date,
  status text not null default 'active' check (status in ('active','expired','terminated')),
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_name on clients (lower(name));
create index if not exists idx_suppliers_category on suppliers (category);
create index if not exists idx_contacts_client on client_contacts (client_id);
create index if not exists idx_supplier_contracts_expiry on supplier_contracts (expiry_date);
