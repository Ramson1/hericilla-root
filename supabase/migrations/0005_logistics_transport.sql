-- 0005: Logistics & transportation jobs, status history, POD, trip expenses

create table if not exists transport_jobs (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default next_ref('JOB'),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  pickup_location text not null,
  pickup_site_id uuid references sites(id),
  destination text not null,
  destination_site_id uuid references sites(id),
  delivery_instructions text,
  client_contact_name text,
  client_contact_phone text,
  scheduled_at timestamptz,
  driver_id uuid references profiles(id),
  vehicle_id uuid,                        -- FK added in 0014 when vehicles exists
  team_lead_id uuid references profiles(id),
  status job_status not null default 'assigned',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only status ledger (drives trackers + reports)
create table if not exists job_status_history (
  id bigint generated always as identity primary key,
  transport_job_id uuid not null references transport_jobs(id) on delete cascade,
  from_status job_status,
  to_status job_status not null,
  actor_id uuid references profiles(id),
  gps_lat double precision,
  gps_lng double precision,
  source text not null default 'admin' check (source in ('admin','staff_app','driver_app','offline_sync')),
  note text,
  occurred_at timestamptz not null default now()
);

create table if not exists proof_of_delivery (
  id uuid primary key default gen_random_uuid(),
  transport_job_id uuid not null references transport_jobs(id) on delete cascade,
  photos text[] not null default '{}',
  recipient_name text,
  recipient_signature_url text,
  delivered_at timestamptz not null default now(),
  outcome pod_outcome not null default 'delivered',
  notes text,
  submitted_by uuid references profiles(id),
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists trip_expenses (
  id uuid primary key default gen_random_uuid(),
  transport_job_id uuid references transport_jobs(id) on delete cascade,
  vehicle_id uuid,
  expense_type expense_type not null,
  amount numeric(14,2) not null check (amount > 0),
  receipt_urls text[] not null default '{}',
  occurred_at date not null default current_date,
  submitted_by uuid references profiles(id),
  status approval_status not null default 'pending',
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);

-- Sync job status into the history ledger automatically
create or replace function public.log_job_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into job_status_history (transport_job_id, from_status, to_status, actor_id, source)
    values (new.id, old.status, new.status, auth.uid(), 'admin');
  end if;
  return new;
end $$;

drop trigger if exists trg_job_status_history on transport_jobs;
create trigger trg_job_status_history
  after update of status on transport_jobs
  for each row execute function public.log_job_status_change();

-- Keeping work_orders in step with their transport job
create or replace function public.sync_wo_with_transport_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('accepted','arrived','loaded','in_transit') then
    update work_orders set status='in_progress', started_at=coalesce(started_at, now()) where id = new.work_order_id;
  elsif new.status in ('delivered','verified') then
    update work_orders set status='completed' where id = new.work_order_id;
  elsif new.status = 'closed' then
    update work_orders set status='closed', completed_at=coalesce(completed_at, now()) where id = new.work_order_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_wo_sync_transport on transport_jobs;
create trigger trg_wo_sync_transport
  after update of status on transport_jobs
  for each row execute function public.sync_wo_with_transport_job();

create index if not exists idx_tj_driver on transport_jobs (driver_id, status);
create index if not exists idx_tj_wo on transport_jobs (work_order_id);
create index if not exists idx_jsh_job_time on job_status_history (transport_job_id, occurred_at);
create index if not exists idx_te_status on trip_expenses (status);
