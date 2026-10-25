-- 0019: Reporting views (security_invoker so RLS of the underlying tables applies)

-- Revenue, cost & margin per work order
create or replace view hericilla_job_margins with (security_invoker = on) as
select wo.id as work_order_id, wo.wo_number, wo.service_type, wo.status, c.name as client_name,
       coalesce(inv.invoiced_total, 0)                        as revenue,
       coalesce(exp.expense_total, 0) + coalesce(te.expense_total, 0) + coalesce(po.po_total, 0) as cost,
       coalesce(inv.invoiced_total, 0)
         - (coalesce(exp.expense_total, 0) + coalesce(te.expense_total, 0) + coalesce(po.po_total, 0)) as margin
from hericilla_work_orders wo
left join hericilla_clients c on c.id = wo.client_id
left join (select work_order_id, sum(total) as invoiced_total
           from hericilla_invoices where status <> 'draft' and deleted_at is null
           group by work_order_id) inv on inv.work_order_id = wo.id
left join (select work_order_id, sum(amount) as expense_total
           from hericilla_expenses where status = 'approved' group by work_order_id) exp on exp.work_order_id = wo.id
left join (select tj.work_order_id, sum(tre.amount) as expense_total
           from hericilla_trip_expenses tre join hericilla_transport_jobs tj on tj.id = tre.transport_job_id
           where tre.status = 'approved' group by tj.work_order_id) te on te.work_order_id = wo.id
left join (select work_order_id, sum(total_amount) as po_total
           from hericilla_purchase_orders
           where work_order_id is not null and status in ('sent','received','closed')
           group by work_order_id) po on po.work_order_id = wo.id;

-- Outstanding receivables with ageing buckets
create or replace view hericilla_receivables with (security_invoker = on) as
select i.id, i.ref_no, c.name as client_name, i.issue_date, i.due_date,
       i.total, i.amount_paid, (i.total - i.amount_paid) as outstanding,
       case
         i.due_date
           when null then 'no_due_date'
           else (case
             when i.due_date >= current_date then 'current'
             when i.due_date >= current_date - 30 then 'overdue_1_30'
             when i.due_date >= current_date - 60 then 'overdue_31_60'
             when i.due_date >= current_date - 90 then 'overdue_61_90'
             else 'overdue_90plus' end)
       end as ageing_bucket
from hericilla_invoices i
join hericilla_clients c on c.id = i.client_id
where i.status in ('sent','partial','overdue') and i.deleted_at is null
  and i.total - i.amount_paid > 0;

-- "Where is every vehicle right now" board
create or replace view hericilla_fleet_board with (security_invoker = on) as
select v.id, v.reg_no, v.make, v.model, v.vehicle_type, v.status as vehicle_status,
       v.odometer_km, v.insurance_expiry, v.inspection_expiry,
       va.driver_id, p.full_name as driver_name, va.work_order_id, wo.wo_number,
       mv.occurred_at as last_movement_at, mv.movement_type as last_movement,
       mv.location_note as last_location
from hericilla_vehicles v
left join lateral (
  select * from hericilla_vehicle_allocations a
  where a.vehicle_id = v.id and a.released_at is null
  order by a.valid_from desc limit 1
) va on true
left join hericilla_profiles p on p.id = va.driver_id
left join hericilla_work_orders wo on wo.id = va.work_order_id
left join lateral (
  select * from hericilla_vehicle_movements m
  where m.vehicle_id = v.id
  order by m.occurred_at desc limit 1
) mv on true
where v.status <> 'retired';

-- Monthly attendance hours per employee (feeds payroll reports)
create or replace view hericilla_attendance_monthly with (security_invoker = on) as
select employee_id, date_trunc('month', work_date)::date as month,
       count(*) filter (where day_status <> 'absent') as days_present,
       count(*) filter (where is_late)                as days_late,
       sum(gross_hours)                               as gross_hours
from hericilla_attendance_daily
group by employee_id, date_trunc('month', work_date);

-- Payroll payment tracking per run
create or replace view hericilla_payroll_status with (security_invoker = on) as
select pr.id as run_id, pr.period_month, pr.status, pr.total_gross, pr.total_net,
       count(ps.*)                            as payslip_count,
       count(ps.*) filter (where ps.payment_status = 'paid') as paid_count,
       coalesce(sum(ps.net) filter (where ps.payment_status = 'paid'), 0) as paid_amount
from hericilla_payroll_runs pr
left join hericilla_payslips ps on ps.payroll_run_id = pr.id
group by pr.id;

-- Live stock valuation (stock_levels already carries item metadata)
create or replace view hericilla_stock_valuation with (security_invoker = on) as
select item_id as id, sku, name, uom, location, unit_value, min_stock_level,
       on_hand as quantity_on_hand,
       round(on_hand * unit_value, 2) as stock_value,
       (on_hand < min_stock_level)    as needs_reorder
from hericilla_stock_levels;

-- Job pipeline snapshot for the dashboard (counts by status)
create or replace view hericilla_pipeline with (security_invoker = on) as
select 'service_requests' as entity, status::text as state, count(*) as n
  from hericilla_service_requests group by status
union all
select 'work_orders', status::text, count(*) from hericilla_work_orders group by status
union all
select 'transport_jobs', status::text, count(*) from hericilla_transport_jobs group by status
union all
select 'invoices', status::text, count(*) from hericilla_invoices where deleted_at is null group by status
union all
select 'enquiries', status::text, count(*) from hericilla_enquiries group by status;

-- Today's attendance triage for supervisors/admins
create or replace view hericilla_attendance_today with (security_invoker = on) as
select ad.*, p.full_name, p.department_id, d.name as department_name
from hericilla_attendance_daily ad
join hericilla_profiles p on p.id = ad.employee_id
left join hericilla_departments d on d.id = p.department_id
where ad.work_date = current_date;

-- Website enquiry → SR conversion stats
create or replace view hericilla_enquiry_stats with (security_invoker = on) as
select date_trunc('month', created_at)::date as month,
       count(*) as total,
       count(*) filter (where converted_to_service_request_id is not null) as converted,
       count(*) filter (where status = 'new') as awaiting
from hericilla_enquiries
group by date_trunc('month', created_at);
