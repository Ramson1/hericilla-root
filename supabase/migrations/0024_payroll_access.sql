-- 0024: Payroll visibility — finance/HR/auditor roles need the staff directory
-- to assign salary structures, name payslip recipients and audit payroll.
-- Additive policy: RLS policies OR together, this only widens SELECT for those roles.

drop policy if exists profiles_payroll_read on profiles;
create policy profiles_payroll_read on profiles for select to authenticated
  using (public.has_role('finance_officer','hr_officer','auditor'));

-- Driver app: a driver must be able to read the service request behind their transport
-- job so "report a problem" (request_feedback kind='issue') passes the FK visibility check.
-- Replaces 0018 sr_read with one extra EXISTS clause; all previous allowances stay.
drop policy if exists sr_read on service_requests;
create policy sr_read on service_requests for select to authenticated
  using (public.is_ops() or assigned_to = auth.uid() or created_by = auth.uid()
         or exists (select 1 from job_staff js where js.work_order_id in
               (select wo.id from work_orders wo where wo.service_request_id = service_requests.id)
               and js.profile_id = auth.uid())
         or exists (select 1 from work_orders wo
                    join transport_jobs tj on tj.work_order_id = wo.id
                    where wo.service_request_id = service_requests.id and tj.driver_id = auth.uid()));
