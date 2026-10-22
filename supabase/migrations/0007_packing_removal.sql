-- 0007: Packing, relocation & removal jobs

create table if not exists packing_jobs (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default next_ref('JOB'),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  origin_address text not null,
  destination_address text not null,
  supervisor_id uuid references profiles(id),
  scheduled_at timestamptz,
  stage packing_stage not null default 'packing',
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists packing_job_teams (
  packing_job_id uuid not null references packing_jobs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role_in_job text not null default 'packer',
  primary key (packing_job_id, profile_id)
);

create table if not exists packing_job_vehicles (
  id uuid primary key default gen_random_uuid(),
  packing_job_id uuid not null references packing_jobs(id) on delete cascade,
  vehicle_id uuid,
  equipment text,                     -- crane / forklift / FIDI truck etc.
  unique (packing_job_id, vehicle_id, equipment)
);

create table if not exists removal_items (
  id uuid primary key default gen_random_uuid(),
  packing_job_id uuid not null references packing_jobs(id) on delete cascade,
  box_no text,
  description text not null,
  quantity numeric(12,2) not null default 1,
  condition text check (condition in ('new','good','fair','damaged')) default 'good',
  created_at timestamptz not null default now()
);

create table if not exists handover_records (
  id uuid primary key default gen_random_uuid(),
  packing_job_id uuid not null references packing_jobs(id) on delete cascade,
  handed_over_at timestamptz not null default now(),
  handed_by text,
  received_by text,
  item_summary text,
  signature_url text,
  notes text
);

create or replace function public.sync_wo_with_packing_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage in ('packing','loaded','transit','unloading') then
    update work_orders set status='in_progress', started_at=coalesce(started_at, now()) where id = new.work_order_id;
  elsif new.stage = 'completed' then
    update work_orders set status='completed', completed_at=coalesce(completed_at, now()) where id = new.work_order_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_wo_sync_packing on packing_jobs;
create trigger trg_wo_sync_packing
  after update of stage on packing_jobs
  for each row execute function public.sync_wo_with_packing_job();

create index if not exists idx_pj_stage on packing_jobs (stage);
create index if not exists idx_ri_job on removal_items (packing_job_id);
