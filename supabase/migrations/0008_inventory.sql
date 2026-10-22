-- 0008: Inventory & materials — items, append-only stock ledger, reorder alerts

create table if not exists inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references inventory_categories(id),
  uom text not null default 'pcs',            -- piece | kg | litre | metre | set
  min_stock_level numeric(12,2) not null default 0,
  reorder_qty numeric(12,2) not null default 0,
  unit_value numeric(14,2) not null default 0, -- for valuation reports
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only movement ledger: the single source of truth for balances
create table if not exists stock_movements (
  id bigint generated always as identity primary key,
  item_id uuid not null references inventory_items(id) on delete restrict,
  movement_type stock_movement_type not null,
  quantity numeric(12,2) not null check (quantity > 0),
  work_order_id uuid references work_orders(id),
  client_id uuid references clients(id),
  from_location text,
  to_location text,
  note text,
  actor_id uuid references profiles(id),
  occurred_at timestamptz not null default now()
);

-- Live balance per item
create or replace view stock_levels as
select i.id as item_id, i.sku, i.name, i.uom, i.min_stock_level, i.reorder_qty, i.unit_value, i.location,
  coalesce(sum(case
    when m.movement_type in ('received','returned') then m.quantity
    when m.movement_type in ('issued','transferred','written_off','damaged','missing') then -m.quantity
    else 0 end), 0) as on_hand,
  coalesce(sum(case
    when m.movement_type in ('received','returned') then m.quantity
    when m.movement_type in ('issued','transferred','written_off','damaged','missing') then -m.quantity
    else 0 end), 0) * i.unit_value as valuation
from inventory_items i
left join stock_movements m on m.item_id = i.id
group by i.id;

-- Reorder alert table (refreshed by a nightly job + on demand)
create table if not exists reorder_alerts (
  item_id uuid primary key references inventory_items(id) on delete cascade,
  on_hand numeric(12,2) not null,
  min_level numeric(12,2) not null,
  alerted_at timestamptz not null default now(),
  acknowledged_by uuid references profiles(id),
  acknowledged_at timestamptz
);

create or replace function public.refresh_reorder_alerts()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from reorder_alerts ra
    where exists (select 1 from stock_levels sl
                  where sl.item_id = ra.item_id and sl.on_hand >= sl.min_stock_level);
  insert into reorder_alerts (item_id, on_hand, min_level, alerted_at)
  select sl.item_id, sl.on_hand, sl.min_stock_level, now()
  from stock_levels sl
  where sl.on_hand <= sl.min_stock_level
  on conflict (item_id) do update
    set on_hand = excluded.on_hand, alerted_at = excluded.alerted_at;
end $$;

create index if not exists idx_sm_item_time on stock_movements (item_id, occurred_at);
create index if not exists idx_sm_wo on stock_movements (work_order_id);
