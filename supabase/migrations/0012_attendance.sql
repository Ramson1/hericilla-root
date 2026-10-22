-- 0012: Attendance — append-only clock events, rules, corrections, leave, tasks

create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique default gen_random_uuid(),  -- client-generated for offline dedupe
  employee_id uuid not null references profiles(id) on delete cascade,
  event_type attendance_event_type not null,
  work_order_id uuid references work_orders(id),
  site_id uuid references sites(id),
  shift_id uuid references shifts(id),
  event_time timestamptz not null default now(),
  gps_lat double precision,
  gps_lng double precision,
  geofence_result geofence_result not null default 'unchecked',
  source event_source not null default 'web',
  original_event_time timestamptz,          -- set for offline-synced rows
  synced_at timestamptz,                     -- set when an offline row reached the server
  created_at timestamptz not null default now()
);

-- One active (clocked-in) session per employee+job/site/shift+day → prevents overlapping sessions
-- while still allowing clock-ins against different jobs during the day (spec §13).
create unique index if not exists uniq_active_session
  on attendance_events (employee_id, coalesce(work_order_id, site_id, shift_id), ((event_time at time zone 'WAT')::date))
  where event_type = 'clock_in';

create table if not exists attendance_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'default',
  grace_minutes integer not null default 15,
  early_departure_minutes integer not null default 15,
  overtime_multiplier numeric(4,2) not null default 1.5,
  weekly_overtime_cap_hours numeric(6,2) not null default 12,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into attendance_rules (name) values ('Company default')
  on conflict do nothing;

-- Daily roll-up view consumed by dashboard, reports and payroll
create or replace view attendance_daily as
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

create table if not exists attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('missed_clock_in','missed_clock_out','wrong_time','other')),
  requested_event_type attendance_event_type not null,
  requested_time timestamptz not null,
  reason text not null,
  status approval_status not null default 'pending',
  requested_by uuid references profiles(id),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  applied_event_id uuid,           -- filled when approved: a 'correction' source event
  created_at timestamptz not null default now()
);

-- Approving a correction writes a paired clock event (never edits originals)
create or replace function public.approve_attendance_correction(c_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c attendance_corrections;
begin
  select * into c from attendance_corrections where id = c_id;
  if not found then raise exception 'correction not found'; end if;
  if c.status <> 'pending' then raise exception 'already decided'; end if;
  if auth.uid() = c.requested_by and not public.is_admin() then
    raise exception 'staff cannot approve their own corrections';
  end if;
  insert into attendance_events (employee_id, event_type, event_time, source, work_order_id)
  select c.employee_id,
         case when c.requested_event_type='clock_out' and c.kind='missed_clock_out' then 'clock_out'
              when c.requested_event_type='clock_out' and c.kind='wrong_time' then 'clock_out'
              else 'clock_in' end,
         c.requested_time, 'correction', null;
  update attendance_corrections
     set status='approved', decided_by=auth.uid(), decided_at=now()
   where id = c_id;
end $$;

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  leave_type leave_type not null,
  start_date date not null,
  end_date date not null,
  reason text,
  status approval_status not null default 'pending',
  requested_by uuid references profiles(id),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Tasks (staff portal §4.3)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid references profiles(id) on delete set null,
  work_order_id uuid references work_orders(id) on delete set null,
  status task_status not null default 'open',
  priority priority not null default 'normal',
  due_date date,
  progress_note text,
  escalated_to uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Missed clock-out sweeper (runs nightly) → alerts supervisors
create or replace function public.flag_missed_clockouts()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notification_outbox (role_target, channels, title, body, data)
  select 'supervisor', array['email','in_app','web_push']::notification_channel[],
         'Missed clock-out: ' || p.full_name,
         p.full_name || ' clocked in on ' || to_char((ad.work_date)::date,'DD Mon YYYY') || ' but has not clocked out.',
         jsonb_build_object('employee_id', ad.employee_id, 'kind', 'missed_clock_out')
  from attendance_daily ad join profiles p on p.id = ad.employee_id
  where ad.day_status = 'on_duty'
    and ad.work_date < current_date
    and not exists (select 1 from notification_outbox n
                    where n.data->>'employee_id' = ad.employee_id::text
                      and n.data->>'kind' = 'missed_clock_out'
                      and n.created_at > now() - interval '1 day');
end $$;

create index if not exists idx_ae_emp_time on attendance_events (employee_id, event_time);
create index if not exists idx_ae_wo on attendance_events (work_order_id);
create index if not exists idx_tasks_assignee on tasks (assigned_to, status);
create index if not exists idx_leave_status on leave_requests (status);
