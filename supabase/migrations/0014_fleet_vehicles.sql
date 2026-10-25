-- 0014: Fleet — vehicles, allocation, movement ledger, maintenance, inspections, incidents

create table if not exists hericilla_vehicles (
  id uuid primary key default gen_random_uuid(),
  reg_no text not null unique,
  make text,
  model text,
  year integer,
  vehicle_type hericilla_vehicle_type not null default 'truck',
  capacity text,                              -- e.g. "20 tons / 40ft flatbed"
  status hericilla_vehicle_status not null default 'available',
  odometer_km numeric(12,1) default 0,
  insurance_expiry date,
  inspection_expiry date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hericilla_transport_jobs add column if not exists vehicle_id uuid references hericilla_vehicles(id);
alter table hericilla_trip_expenses  add column if not exists vehicle_id uuid references hericilla_vehicles(id);
alter table hericilla_packing_job_vehicles drop constraint if exists fk_pjv_vehicle;
alter table hericilla_packing_job_vehicles add constraint fk_pjv_vehicle foreign key (vehicle_id) references hericilla_vehicles(id);

create table if not exists hericilla_vehicle_allocations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references hericilla_vehicles(id) on delete cascade,
  driver_id uuid references hericilla_profiles(id),
  work_order_id uuid references hericilla_work_orders(id),
  site_id uuid references hericilla_sites(id),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  released_at timestamptz,
  notes text,
  created_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now()
);

-- Prevent double-booking a vehicle for overlapping windows
create or replace function public.hericilla_no_overlapping_allocation()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from hericilla_vehicle_allocations
    where vehicle_id = new.vehicle_id
      and released_at is null and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and valid_from < coalesce(new.valid_to, 'infinity'::timestamptz)
      and coalesce(valid_to, 'infinity'::timestamptz) > new.valid_from
  ) then
    raise exception 'vehicle is already allocated for this period';
  end if;
  return new;
end $$;

drop trigger if exists trg_alloc_overlap on hericilla_vehicle_allocations;
create trigger trg_alloc_overlap
  before insert or update on hericilla_vehicle_allocations
  for each row execute function public.hericilla_no_overlapping_allocation();

-- Append-only movement ledger: where is every vehicle right now
create table if not exists hericilla_vehicle_movements (
  id bigint generated always as identity primary key,
  allocation_id uuid references hericilla_vehicle_allocations(id) on delete set null,
  vehicle_id uuid not null references hericilla_vehicles(id) on delete cascade,
  movement_type hericilla_movement_type not null,
  odometer_km numeric(12,1),
  gps_lat double precision,
  gps_lng double precision,
  location_note text,
  recorded_by uuid references hericilla_profiles(id),
  occurred_at timestamptz not null default now()
);

create table if not exists hericilla_maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references hericilla_vehicles(id) on delete cascade,
  service_type text not null,               -- oil change | tyres | inspection | repair
  every_km numeric(12,1),
  every_days integer,
  last_done_at date,
  last_done_km numeric(12,1),
  next_due_date date,
  next_due_km numeric(12,1),
  is_active boolean not null default true
);

create table if not exists hericilla_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references hericilla_vehicles(id) on delete cascade,
  service_type text not null,
  cost numeric(14,2) not null default 0,
  odometer_km numeric(12,1),
  done_at date not null default current_date,
  vendor text,
  notes text,
  receipt_urls text[] not null default '{}',
  recorded_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists hericilla_inspection_checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trip_phase text not null default 'pre' check (trip_phase in ('pre','post')),
  items jsonb not null default '[]',          -- ["Tyres pressure","Lights","Brakes",…]
  is_active boolean not null default true
);

create table if not exists hericilla_inspection_results (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid references hericilla_inspection_checklists(id),
  vehicle_id uuid not null references hericilla_vehicles(id) on delete cascade,
  transport_job_id uuid references hericilla_transport_jobs(id),
  driver_id uuid references hericilla_profiles(id),
  answers jsonb not null default '{}',        -- {item: true/false}
  faults_reported text,
  photos text[] not null default '{}',
  odometer_km numeric(12,1),
  submitted_at timestamptz not null default now(),
  source hericilla_event_source not null default 'app'
);

create table if not exists hericilla_odometer_readings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references hericilla_vehicles(id) on delete cascade,
  driver_id uuid references hericilla_profiles(id),
  transport_job_id uuid references hericilla_transport_jobs(id),
  reading_km numeric(12,1) not null,
  photo_url text,
  recorded_at timestamptz not null default now()
);

create table if not exists hericilla_incidents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references hericilla_vehicles(id),
  transport_job_id uuid references hericilla_transport_jobs(id),
  incident_type hericilla_incident_type not null,
  severity text not null default 'moderate' check (severity in ('minor','moderate','severe')),
  description text not null,
  photos text[] not null default '{}',
  location text,
  occurred_at timestamptz not null default now(),
  reported_by uuid references hericilla_profiles(id),
  status text not null default 'open' check (status in ('open','reviewing','resolved')),
  resolution_note text
);

-- Keep the vehicle's odometer at its latest reading
create or replace function public.hericilla_sync_odometer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hericilla_vehicles set odometer_km = greatest(coalesce(odometer_km,0), new.reading_km), updated_at = now()
    where id = new.vehicle_id;
  return new;
end $$;

drop trigger if exists trg_odometer_sync on hericilla_odometer_readings;
create trigger trg_odometer_sync
  after insert on hericilla_odometer_readings
  for each row execute function public.hericilla_sync_odometer();

create index if not exists idx_vm_vehicle_time on hericilla_vehicle_movements (vehicle_id, occurred_at);
create index if not exists idx_alloc_active on hericilla_vehicle_allocations (vehicle_id) where released_at is null;
create index if not exists idx_maint_due on hericilla_maintenance_schedules (next_due_date) where is_active;
create index if not exists idx_insp_vehicle on hericilla_inspection_results (vehicle_id, submitted_at);
