-- 0004: Service requests, quotations, work orders (the spine) + client feedback

create table if not exists service_requests (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default next_ref('SR'),
  client_id uuid references clients(id),
  enquiry_id uuid,                        -- FK added in 0015 when enquiries exists
  origin text not null default 'internal' check (origin in ('client','internal','website')),
  service_type service_type not null,
  title text not null,
  description text,
  priority priority not null default 'normal',
  deadline date,
  sla_days integer,
  status sr_status not null default 'new',
  assigned_department_id uuid references departments(id),
  assigned_to uuid references profiles(id),
  created_by uuid references profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default next_ref('INV'),   -- quotation numbers share INV series
  service_request_id uuid not null references service_requests(id) on delete cascade,
  client_id uuid references clients(id),
  valid_until date,
  subtotal numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 7.5,
  total numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected','expired')),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  wo_number text not null unique default next_ref('WO'),
  service_request_id uuid references service_requests(id),
  quotation_id uuid references quotations(id),
  client_id uuid references clients(id),
  service_type service_type not null,
  title text not null,
  status wo_status not null default 'open',
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists request_feedback (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  kind text not null default 'feedback' check (kind in ('feedback','complaint','issue')),
  message text not null,
  rating integer check (rating between 1 and 5),
  raised_by text,                          -- client contact name or profile id as text
  handled_by uuid references profiles(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Job staff assignment (used by transport + packing jobs)
create table if not exists job_staff (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role_in_job text not null default 'crew',   -- crew | supervisor | driver | loader
  assigned_at timestamptz not null default now(),
  unique (work_order_id, profile_id)
);

-- Keep quotation totals in sync with line items
create or replace function public.sync_quotation_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare q_id uuid := coalesce(new.quotation_id, old.quotation_id);
begin
  update quotations q
     set subtotal = coalesce((select sum(amount) from quotation_items where quotation_id = q_id), 0),
         total    = round(coalesce((select sum(amount) from quotation_items where quotation_id = q_id), 0)
                  * (1 + q.tax_rate/100.0), 2)
   where q.id = q_id;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_quotation_items_sync on quotation_items;
create trigger trg_quotation_items_sync
  after insert or update or delete on quotation_items
  for each row execute function public.sync_quotation_totals();

-- Approving a quotation creates the work order (Client Service Workflow, spec §17A)
create or replace function public.create_wo_on_quote_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare sr service_requests;
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    select * into sr from service_requests where id = new.service_request_id;
    insert into work_orders (service_request_id, quotation_id, client_id, service_type, title, created_by)
    values (sr.id, new.id, coalesce(new.client_id, sr.client_id), sr.service_type, sr.title, auth.uid());
    update service_requests set status = 'approved' where id = sr.id and status in ('new','quoted');
  end if;
  return new;
end $$;

drop trigger if exists trg_quote_approval on quotations;
create trigger trg_quote_approval
  after update of status on quotations
  for each row execute function public.create_wo_on_quote_approval();

create index if not exists idx_sr_status on service_requests (status);
create index if not exists idx_sr_client on service_requests (client_id);
create index if not exists idx_wo_status on work_orders (status);
create index if not exists idx_wo_sr on work_orders (service_request_id);
