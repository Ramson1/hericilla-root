-- 0029 — a low-stock alert must clear once the item is covered again.
--
-- hericilla_refresh_reorder_alerts() (0008_inventory.sql) deleted alerts when
-- on_hand >= min_stock_level and inserted them when on_hand <= min_stock_level. Both
-- conditions are true at exactly the minimum, so every run deleted the row and inserted it
-- again with a fresh now(); and because the upsert also reset alerted_at, an alert could
-- never age. The visible result was the Alerts tab still naming an item that the Stock KPI
-- already reported as fine.
--
-- Delete strictly ABOVE the minimum, and leave alerted_at alone on conflict so the row keeps
-- recording when the shortage was first seen.

create or replace function public.hericilla_refresh_reorder_alerts()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from hericilla_reorder_alerts ra
    where exists (select 1 from hericilla_stock_levels sl
                  where sl.item_id = ra.item_id and sl.on_hand > sl.min_stock_level);
  insert into hericilla_reorder_alerts (item_id, on_hand, min_level, alerted_at)
  select sl.item_id, sl.on_hand, sl.min_stock_level, now()
  from hericilla_stock_levels sl
  where sl.on_hand <= sl.min_stock_level
  on conflict (item_id) do update
    set on_hand = excluded.on_hand,
        min_level = excluded.min_level;
end $$;

comment on function public.hericilla_refresh_reorder_alerts() is
  'Recomputes hericilla_reorder_alerts: an item is short while on_hand <= min_stock_level, and the alert keeps its original alerted_at';
