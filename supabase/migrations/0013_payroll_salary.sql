-- 0013: Salary allocator & tracking — structures, payroll runs, payslips
-- Attendance hours feed payroll ONLY after company-approved rules are applied (spec §19).

create table if not exists hericilla_salary_structures (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hericilla_profiles(id) on delete cascade,
  base_salary numeric(14,2) not null check (base_salary >= 0),
  allowances jsonb not null default '[]',        -- [{name, amount}]
  deductions jsonb not null default '[]',        -- [{name, amount|percent}]
  pay_cycle text not null default 'monthly' check (pay_cycle in ('monthly','biweekly','weekly')),
  effective_from date not null default current_date,
  effective_to date,
  is_current boolean not null default true,
  created_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now()
);

-- Only one current structure per employee
create unique index if not exists uniq_current_salary on hericilla_salary_structures (employee_id) where is_current;

create table if not exists hericilla_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,                    -- first day of month
  status hericilla_payroll_run_status not null default 'draft',
  generated_at timestamptz,
  submitted_by uuid references hericilla_profiles(id),
  approved_by uuid references hericilla_profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  total_gross numeric(16,2) not null default 0,
  total_net numeric(16,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (period_month)
);

create table if not exists hericilla_payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references hericilla_payroll_runs(id) on delete cascade,
  employee_id uuid not null references hericilla_profiles(id) on delete cascade,
  base_salary numeric(14,2) not null default 0,
  hours_worked numeric(8,2) not null default 0,
  overtime_hours numeric(8,2) not null default 0,
  overtime_amount numeric(14,2) not null default 0,
  allowances_amount numeric(14,2) not null default 0,
  deductions_amount numeric(14,2) not null default 0,
  statutory_deductions numeric(14,2) not null default 0,
  adjustment_amount numeric(14,2) not null default 0,
  adjustment_reason text,
  gross numeric(14,2) not null default 0,
  net numeric(14,2) not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  paid_at date,
  payment_method text,
  payment_reference text,
  approved_by uuid references hericilla_profiles(id),      -- audit: who approved this line
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

-- Generate draft payslips for a month from approved attendance + salary structures.
-- Hours = sum(hericilla_attendance_daily.gross_hours) minus shift break allowance; overtime beyond
-- the shift's scheduled hours uses hericilla_attendance_rules.multiplier.
create or replace function public.hericilla_generate_payroll_run(period date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  run_id uuid;
  r record;
  rule hericilla_attendance_rules;
  struct hericilla_salary_structures;
  hours numeric; ot_hours numeric; sched_hours numeric;
  base numeric; ot_amount numeric; allow_amt numeric; ded_amt numeric;
  hourly numeric;
begin
  if not public.hericilla_has_role('finance_officer','admin','super_admin','hr_officer') then
    raise exception 'not authorised to generate payroll';
  end if;
  select * into rule from hericilla_attendance_rules where is_active limit 1;
  insert into hericilla_payroll_runs (period_month, status, generated_at)
  values (date_trunc('month', period), 'draft', now())
  returning id into run_id;

  for r in select p.id as employee_id
           from hericilla_profiles p
           join hericilla_salary_structures s on s.employee_id = p.id and s.is_current
           where p.status = 'active'
           group by p.id loop
    select * into struct from hericilla_salary_structures where employee_id = r.employee_id and is_current limit 1;
    select coalesce(sum(gross_hours),0) into hours
      from hericilla_attendance_daily ad
      where ad.employee_id = r.employee_id
        and date_trunc('month', ad.work_date) = date_trunc('month', period);
    select coalesce(sum((extract(epoch from (end_time - start_time))/3600.0)::numeric),0) into sched_hours
      from hericilla_shift_assignments sa join hericilla_shifts s on s.id = sa.shift_id
      where sa.employee_id = r.employee_id
        and date_trunc('month', sa.work_date) = date_trunc('month', period);
    if hours is null then hours := 0; end if;
    ot_hours := greatest(0, coalesce(hours,0) - coalesce(sched_hours,0));
    if ot_hours > rule.weekly_overtime_cap_hours * 4 then
      ot_hours := rule.weekly_overtime_cap_hours * 4;   -- cap ~4 weeks
    end if;
    base := struct.base_salary;
    hourly := case when coalesce(sched_hours,0) > 0 then base / greatest(sched_hours,1) else base / 192 end;
    ot_amount := round(ot_hours * hourly * rule.overtime_multiplier, 2);
    select coalesce(sum((a->>'amount')::numeric),0) into allow_amt from jsonb_array_elements(struct.allowances) a;
    select coalesce(sum(case
             when d ? 'percent' then base * (d->>'percent')::numeric / 100
             else (d->>'amount')::numeric end),0) into ded_amt
      from jsonb_array_elements(struct.deductions) d;

    insert into hericilla_payslips (payroll_run_id, employee_id, base_salary, hours_worked, overtime_hours,
                          overtime_amount, allowances_amount, deductions_amount, gross, net)
    values (run_id, r.employee_id, base, round(hours,2), round(ot_hours,2), ot_amount, allow_amt, ded_amt,
            round(base + ot_amount + allow_amt, 2),
            round(base + ot_amount + allow_amt - ded_amt, 2));
  end loop;

  update hericilla_payroll_runs
     set total_gross = coalesce((select sum(gross) from hericilla_payslips where payroll_run_id = run_id),0),
         total_net   = coalesce((select sum(net)  from hericilla_payslips where payroll_run_id = run_id),0)
   where id = run_id;
  return run_id;
end $$;

-- Approve a payroll run: approver must not be in the run's recipient list unless super_admin
create or replace function public.hericilla_approve_payroll_run(run uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.hericilla_has_role('finance_officer','admin','super_admin') then
    raise exception 'not authorised to approve payroll';
  end if;
  if exists (select 1 from hericilla_payslips ps
             where ps.payroll_run_id = run and ps.employee_id = auth.uid())
     and not public.hericilla_has_role('super_admin') then
    raise exception 'staff cannot approve their own payroll';
  end if;
  update hericilla_payroll_runs set status='approved', approved_by=auth.uid(), approved_at=now()
    where id = run and status in ('draft','pending_approval');
  update hericilla_payslips set approved_by = auth.uid() where payroll_run_id = run;
end $$;

create index if not exists idx_ps_run on hericilla_payslips (payroll_run_id);
create index if not exists idx_ps_emp on hericilla_payslips (employee_id);
