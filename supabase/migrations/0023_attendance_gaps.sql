-- 0023: Attendance workflow gaps found while building the admin attendance module.
-- 1) attendance_corrections had read/insert policies only — supervisors could approve
--    via the definer RPC but had no way to REJECT a correction request.
-- 2) attendance_daily was a plain view (runs as owner), which bypasses RLS on
--    attendance_events for anyone with select on the view. Re-declared with
--    security_invoker so employees see their own days and managers see their scope.

drop policy if exists corr_ops_update on attendance_corrections;
create policy corr_ops_update on attendance_corrections for update to authenticated
  using (public.is_ops() and (requested_by <> auth.uid() or public.is_admin()))
  with check (public.is_ops());

create or replace view attendance_daily with (security_invoker = on) as
with events as (
  select e.employee_id,
         (e.event_time at time zone 'WAT')::date as work_date,
         e.event_type, e.event_time, e.geofence_result,
         e.work_order_id
  from attendance_events e
),
first_last as (
  select employee_id, work_date,
         min(event_time) filter (where event_type='clock_in')  as first_in,
         max(event_time) filter (where event_type='clock_out') as last_out,
         sum(case when event_type='break_start' then 1 else 0 end) as breaks_taken
  from events group by employee_id, work_date
),
worked as (
  select fl.*,
         extract(epoch from (fl.last_out - fl.first_in))/3600.0 as gross_hours
  from first_last fl
)
select w.employee_id, w.work_date, w.first_in, w.last_out, w.gross_hours,
       w.breaks_taken,
       s.start_time, s.end_time,
       case
         when w.first_in is null then 'absent'
         when w.last_out is null then 'on_duty'
         else 'clocked_out'
       end as day_status,
       case
         when w.first_in is not null and s.start_time is not null
              and (w.first_in at time zone 'WAT')::time > s.start_time + (coalesce(r.grace_minutes,15) || ' minutes')::interval
         then true else false
       end as is_late
from worked w
join profiles p on p.id = w.employee_id
left join shift_assignments sa on sa.employee_id = w.employee_id and sa.work_date = w.work_date
left join shifts s on s.id = sa.shift_id
left join attendance_rules r on r.is_active
where 1=1;
