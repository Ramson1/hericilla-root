-- 0030 — inventory items can be retired, and the stock KPI agrees with the alert rule.
--
-- Two separate problems:
--
-- 1. The inventory page could create items but never retire one. A hard delete is not
--    available: hericilla_stock_movements.item_id is ON DELETE RESTRICT and
--    hericilla_reorder_alerts references it too, so any item that has ever moved cannot be
--    removed without destroying the ledger. clients, suppliers and service_requests already
--    solve this with a nullable deleted_at, so items get the same treatment and every read
--    path hides retired rows.
--
-- 2. hericilla_stock_valuation reported needs_reorder as (on_hand < min_stock_level) while
--    hericilla_refresh_reorder_alerts() files an alert at (on_hand <= min_stock_level). An
--    item sitting exactly on its minimum was therefore alerting but shown as healthy, which
--    is the same disagreement 0029 removed on the alert side.

alter table public.hericilla_inventory_items
  add column if not exists deleted_at timestamptz;

comment on column public.hericilla_inventory_items.deleted_at is
  'Set when an item is retired from the catalogue; the ledger and valuation history are kept';

create index if not exists idx_inv_items_live
  on public.hericilla_inventory_items (sku)
  where deleted_at is null;

-- Live balance per item — retired items drop out of every balance listing.
--
-- These two views are dropped and recreated rather than replaced in place. PostgreSQL will let a
-- view gain trailing columns under CREATE OR REPLACE, but a genuine reordering (reorder_qty used
-- to sit in the middle) is refused with "cannot change name of view column", so the only way to
-- converge is to rebuild. hericilla_stock_valuation is the single database object that depends on
-- stock_levels — the nightly alert function reads it at run time, not through the dependency
-- graph — and both definitions live in this file, so the rebuild cannot orphan anything. Grants
-- do not survive a drop, so they are re-issued.
drop view if exists public.hericilla_stock_valuation;
drop view if exists public.hericilla_stock_levels;

create view public.hericilla_stock_levels as
select i.id as item_id, i.sku, i.name, i.uom, i.min_stock_level, i.reorder_qty, i.unit_value, i.location,
  coalesce(sum(case
    when m.movement_type in ('received','returned') then m.quantity
    when m.movement_type in ('issued','transferred','written_off','damaged','missing') then -m.quantity
    else 0 end), 0) as on_hand,
  coalesce(sum(case
    when m.movement_type in ('received','returned') then m.quantity
    when m.movement_type in ('issued','transferred','written_off','damaged','missing') then -m.quantity
    else 0 end), 0) * i.unit_value as valuation
from public.hericilla_inventory_items i
left join public.hericilla_stock_movements m on m.item_id = i.id
where i.deleted_at is null
group by i.id;

-- Live stock valuation, now excluding retired items and flagging the boundary the same way
-- the alert rule does: at exactly the minimum there is nothing left above the floor.
create view public.hericilla_stock_valuation with (security_invoker = on) as
select item_id as id, sku, name, uom, location, unit_value, min_stock_level, reorder_qty,
       on_hand as quantity_on_hand,
       round(on_hand * unit_value, 2) as stock_value,
       (on_hand <= min_stock_level)    as needs_reorder
from public.hericilla_stock_levels;

grant select on public.hericilla_stock_levels to authenticated, anon, service_role;
grant select on public.hericilla_stock_valuation to authenticated, anon, service_role;

-- Keep 0029's rule, plus: an alert for a retired item is meaningless, so clear it and never
-- file a new one.
create or replace function public.hericilla_refresh_reorder_alerts()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from hericilla_reorder_alerts ra
    where not exists (select 1 from hericilla_inventory_items i
                      where i.id = ra.item_id and i.deleted_at is null)
       or exists (select 1 from hericilla_stock_levels sl
                  where sl.item_id = ra.item_id and sl.on_hand > sl.min_stock_level);

  insert into hericilla_reorder_alerts (item_id, on_hand, min_level, alerted_at)
  select sl.item_id, sl.on_hand, sl.min_stock_level, now()
  from hericilla_stock_levels sl
  where sl.on_hand <= sl.min_stock_level
  on conflict (item_id) do update
    set on_hand = excluded.on_hand,
        min_level = excluded.min_level;
end $$;
