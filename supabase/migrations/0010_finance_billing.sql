-- 0010: Finance & billing — invoices, payments, adjustments, expenses, rates

create table if not exists hericilla_invoices (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default hericilla_next_ref('INV'),
  client_id uuid not null references hericilla_clients(id),
  work_order_id uuid references hericilla_work_orders(id),
  quotation_id uuid references hericilla_quotations(id),
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 7.5,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status hericilla_invoice_status not null default 'draft',
  notes text,
  created_by uuid references hericilla_profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references hericilla_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) generated always as (quantity * unit_price) stored
);

create table if not exists hericilla_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references hericilla_invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'transfer',
  paid_at date not null default current_date,
  reference text,
  recorded_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now()
);

-- Append-only adjustment ledger (traceability, spec §11)
create table if not exists hericilla_invoice_adjustments (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references hericilla_invoices(id) on delete cascade,
  kind text not null check (kind in ('discount','credit_note','correction','waiver')),
  amount numeric(14,2) not null,
  reason text not null,
  made_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists hericilla_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'operational',   -- operational | job_cost | supplier_payment
  work_order_id uuid references hericilla_work_orders(id),
  supplier_id uuid references hericilla_suppliers(id),
  invoice_id uuid references hericilla_invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  occurred_at date not null default current_date,
  receipt_urls text[] not null default '{}',
  status hericilla_approval_status not null default 'pending',
  submitted_by uuid references hericilla_profiles(id),
  approved_by uuid references hericilla_profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists hericilla_billing_rates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references hericilla_clients(id),          -- null = default company rate
  service_type hericilla_service_type not null,
  rate_label text not null,                        -- e.g. "Flatbed truck per trip PHA-Aba"
  rate numeric(14,2) not null,
  unit text not null default 'trip',
  valid_from date not null default current_date,
  valid_to date,
  is_active boolean not null default true
);

alter table hericilla_client_payments  add column if not exists invoice_id uuid references hericilla_invoices(id);
alter table hericilla_documents        add column if not exists invoice_id uuid references hericilla_invoices(id);

-- Invoice totals + status from payments
create or replace function public.hericilla_sync_invoice_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv_id uuid;
begin
  inv_id := case when TG_TABLE_NAME = 'invoice_items' then coalesce(new.invoice_id, old.invoice_id)
                 else coalesce(new.invoice_id, old.invoice_id) end;
  update hericilla_invoices i
     set subtotal = coalesce((select sum(amount) from hericilla_invoice_items where invoice_id = inv_id), 0),
         total = round(coalesce((select sum(amount) from hericilla_invoice_items where invoice_id = inv_id), 0) * (1 + i.tax_rate/100.0), 2)
           + coalesce((select sum(amount) from hericilla_invoice_adjustments where invoice_id = inv_id), 0),
         amount_paid = coalesce((select sum(amount) from hericilla_invoice_payments where invoice_id = inv_id), 0)
   where i.id = inv_id;
  update hericilla_invoices
     set status = case
       when amount_paid >= total and total > 0 then 'paid'::hericilla_invoice_status
       when amount_paid > 0 then 'partial'::hericilla_invoice_status
       when status in ('sent','partial','paid','overdue') and due_date < current_date and amount_paid < total then 'overdue'::hericilla_invoice_status
       else status end
   where id = inv_id;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_invoice_items_sync on hericilla_invoice_items;
create trigger trg_invoice_items_sync
  after insert or update or delete on hericilla_invoice_items
  for each row execute function public.hericilla_sync_invoice_totals();

drop trigger if exists trg_invoice_payments_sync on hericilla_invoice_payments;
create trigger trg_invoice_payments_sync
  after insert or update or delete on hericilla_invoice_payments
  for each row execute function public.hericilla_sync_invoice_totals();

create index if not exists idx_inv_status on hericilla_invoices (status);
create index if not exists idx_inv_client on hericilla_invoices (client_id);
create index if not exists idx_exp_status on hericilla_expenses (status);
