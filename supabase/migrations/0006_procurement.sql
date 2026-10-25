-- 0006: Procurement — requisitions, supplier quotations, approvals, POs, GRN

create table if not exists hericilla_approval_limits (
  role hericilla_app_role primary key,
  max_amount numeric(14,2) not null default 0,
  notes text
);
insert into hericilla_approval_limits (role, max_amount) values
  ('procurement_officer', 1000000),
  ('finance_officer', 3000000),
  ('supervisor', 2000000),
  ('admin', 100000000),
  ('super_admin', 1000000000)
on conflict (role) do nothing;

create table if not exists hericilla_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default hericilla_next_ref('SR'),
  work_order_id uuid references hericilla_work_orders(id),
  client_id uuid references hericilla_clients(id),
  requested_by uuid references hericilla_profiles(id),
  need_by_date date,
  description text,
  estimated_cost numeric(14,2),
  status hericilla_pr_status not null default 'draft',
  required_approver_role hericilla_app_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references hericilla_purchase_requests(id) on delete cascade,
  material text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'pcs',
  estimated_unit_cost numeric(14,2) default 0,
  notes text
);

create table if not exists hericilla_supplier_quotations (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references hericilla_purchase_requests(id) on delete cascade,
  supplier_id uuid not null references hericilla_suppliers(id),
  total_amount numeric(14,2) not null,
  payment_terms text,
  lead_time_days integer,
  valid_until date,
  document_url text,
  is_selected boolean not null default false,
  created_at timestamptz not null default now()
);

-- Selecting a supplier quotation (only one per PR)
create or replace function public.hericilla_select_supplier_quotation(q_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare q hericilla_supplier_quotations;
begin
  select * into q from hericilla_supplier_quotations where id = q_id;
  if not found then raise exception 'quotation not found'; end if;
  update hericilla_supplier_quotations set is_selected = false where purchase_request_id = q.purchase_request_id;
  update hericilla_supplier_quotations set is_selected = true where id = q_id;
end $$;

create table if not exists hericilla_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default hericilla_next_ref('PO'),
  purchase_request_id uuid references hericilla_purchase_requests(id),
  supplier_id uuid not null references hericilla_suppliers(id),
  client_id uuid references hericilla_clients(id),
  work_order_id uuid references hericilla_work_orders(id),
  total_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  other_charges numeric(14,2) not null default 0,
  status hericilla_po_status not null default 'draft',
  expected_delivery_date date,
  document_url text,
  created_by uuid references hericilla_profiles(id),
  approved_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_po_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references hericilla_purchase_orders(id) on delete cascade,
  material text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'pcs',
  unit_cost numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  line_total numeric(14,2) generated always as (quantity * unit_cost + tax) stored
);

create table if not exists hericilla_goods_received_notes (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references hericilla_purchase_orders(id) on delete cascade,
  received_at date not null default current_date,
  verified_by uuid references hericilla_profiles(id),
  condition_ok boolean not null default true,
  notes text,
  document_url text,
  created_at timestamptz not null default now()
);

-- PO totals from line items
create or replace function public.hericilla_sync_po_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare po_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
begin
  update hericilla_purchase_orders
     set total_amount = coalesce((select sum(quantity*unit_cost) from hericilla_po_items where purchase_order_id = po_id), 0),
         tax_amount   = coalesce((select sum(tax) from hericilla_po_items where purchase_order_id = po_id), 0)
   where id = po_id;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_po_items_sync on hericilla_po_items;
create trigger trg_po_items_sync
  after insert or update or delete on hericilla_po_items
  for each row execute function public.hericilla_sync_po_totals();

-- Generic approvals table (PR limits, expenses, corrections, payroll)
create table if not exists hericilla_approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,       -- purchase_request | trip_expense | attendance_correction | payroll_run
  entity_id uuid not null,
  required_role hericilla_app_role not null,
  requested_by uuid references hericilla_profiles(id),
  status hericilla_approval_status not null default 'pending',
  decided_by uuid references hericilla_profiles(id),
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, required_role)
);

create index if not exists idx_approvals_pending on hericilla_approvals (status, required_role);
create index if not exists idx_pr_status on hericilla_purchase_requests (status);
create index if not exists idx_po_status on hericilla_purchase_orders (status);
create index if not exists idx_sq_pr on hericilla_supplier_quotations (purchase_request_id);
