-- 0014: Fleet — vehicles, allocation, movement ledger, maintenance, inspections, incidents

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  reg_no text not null unique,
  make text,
  model text,
  year integer,
  vehicle_type vehicle_type not null default 'truck',
  capacity text,                              -- e.g. "20 tons / 40ft flatbed"
  status vehicle_status not null default 'available',
  odometer_km numeric(12,1) default 0,
  insurance_expiry date,
  inspection_expiry date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transport_jobs add column if not exists vehicle_id uuid references vehicles(id);
alter table trip_expenses  add column if not exists vehicle_id uuid references vehicles(id);
alter table packing_job_vehicles add constraint fk_pjv_vehicle foreign key (vehicle_id) references vehicles(id);

create table if not exists vehicle_allocations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  driver_id uuid references profiles(id),
  work_order_id uuid references work_orders(id),
  site_id uuid references sites(id),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  released_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Prevent double-booking a vehicle for overlapping windows
create or replace function public.no_overlapping_allocation()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from vehicle_allocations
    where vehicle_id = new.vehicle_id
      and released_at is null and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and valid_from < coalesce(new.valid_to, 'infinity'::timestamptz)
      and coalesce(valid_to, 'infinity'::timestamptz) > new.valid_from
  ) then
    raise exception 'vehicle is already allocated for this period';
  end if;
  return new;
end $$;

drop trigger if exists trg_alloc_overlap on vehicle_allocations;
create trigger trg_alloc_overlap
  before insert or update on vehicle_allocations
  for each row execute function public.no_overlapping_allocation();

-- Append-only movement ledger: where is every vehicle right now
create table if not exists vehicle_movements (
  id bigint generated always as identity primary key,
  allocation_id uuid references vehicle_allocations(id) on delete set null,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  movement_type movement_type not null,
  odometer_km numeric(12,1),
  gps_lat double precision,
  gps_lng double precision,
  location_note text,
  recorded_by uuid references profiles(id),
  occurred_at timestamptz not null default now()
);

create table if not exists maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  service_type text not null,               -- oil change | tyres | inspection | repair
  every_km numeric(12,1),
  every_days integer,
  last_done_at date,
  last_done_km numeric(12,1),
  next_due_date date,
  next_due_km numeric(12,1),
  is_active boolean not null default true
);

create table if not exists maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  service_type text not null,
  cost numeric(14,2) not null default 0,
  odometer_km numeric(12,1),
  done_at date not null default current_date,
  vendor text,
  notes text,
  receipt_urls text[] not null default '{}',
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists inspection_checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trip_phase text not null default 'pre' check (trip_phase in ('pre','post')),
  items jsonb not null default '[]',          -- ["Tyres pressure","Lights","Brakes",…]
  is_active boolean not null default true
);

create table if not exists inspection_results (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid references inspection_checklists(id),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  transport_job_id uuid references transport_jobs(id),
  driver_id uuid references profiles(id),
  answers jsonb not null default '{}',        -- {item: true/false}
  faults_reported text,
  photos text[] not null default '{}',
  odometer_km numeric(12,1),
  submitted_at timestamptz not null default now(),
  source event_source not null default 'app'
);

create table if not exists odometer_readings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  driver_id uuid references profiles(id),
  transport_job_id uuid references transport_jobs(id),
  reading_km numeric(12,1) not null,
  photo_url text,
  recorded_at timestamptz not null default now()
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id),
  transport_job_id uuid references transport_jobs(id),
  incident_type incident_type not null,
  severity text not null default 'moderate' check (severity in ('minor','moderate','severe')),
  description text not null,
  photos text[] not null default '{}',
  location text,
  occurred_at timestamptz not null default now(),
  reported_by uuid references profiles(id),
  status text not null default 'open' check (status in ('open','reviewing','resolved')),
  resolution_note text
);

-- Keep the vehicle's odometer at its latest reading
create or replace function public.sync_odometer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update vehicles set odometer_km = greatest(coalesce(odometer_km,0), new.reading_km), updated_at = now()
    where id = new.vehicle_id;
  return new;
end $$;

drop trigger if exists trg_odometer_sync on odometer_readings;
create trigger trg_odometer_sync
  after insert on odometer_readings
  for each row execute function public.sync_odometer();

create index if not exists idx_vm_vehicle_time on vehicle_movements (vehicle_id, occurred_at);
create index if not exists idx_alloc_active on vehicle_allocations (vehicle_id) where released_at is null;
create index if not exists idx_maint_due on maintenance_schedules (next_due_date) where is_active;
create index if not exists idx_insp_vehicle on inspection_results (vehicle_id, submitted_at);
