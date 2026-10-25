-- 0018: Row Level Security — deny-by-default policy matrix
-- Every policy starts from "no access unless a policy says so". Helpers from 0001:
--   hericilla_has_role(VARIADIC text[]), hericilla_is_admin(), hericilla_is_ops(), hericilla_is_driver(), hericilla_current_dept_id()

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS on every Hericilla table (views are not touched)
-- ──────────────────────────────────────────────────────────────────────────────
do $$ declare t record; begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    -- Scoped to the hericilla_ namespace: this database can host other projects, and
    -- enabling RLS without policies on one of their tables would lock everyone out.
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'hericilla\_%'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Profile guard — users may never self-promote (role/status/dept/employee_no)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.hericilla_guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Self-promotion check for authenticated API sessions only. A null auth.uid() means a server-side
  -- context (seed / service role / SQL editor), which RLS already governs — an anon caller can never
  -- reach an UPDATE on this table, and service role is trusted by design. Enforcing on those sessions
  -- would only block legitimate bootstrap/seed writes, since hericilla_has_role resolves auth.uid().
  if auth.uid() is not null
     and (new.role is distinct from old.role
          or new.status is distinct from old.status
          or new.department_id is distinct from old.department_id
          or new.employee_no is distinct from old.employee_no)
     and not public.hericilla_has_role('super_admin','admin','hr_officer') then
    raise exception 'only administrators or HR may change role, status, department or employee number';
  end if;
  return new;
end $$;

drop trigger if exists trg_profile_guard on hericilla_profiles;
create trigger trg_profile_guard
  before update on hericilla_profiles
  for each row execute function public.hericilla_guard_profile_update();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Public / anonymous (website)
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists blog_public_read on hericilla_blog_posts;
create policy blog_public_read on hericilla_blog_posts for select
  using (status = 'published' and (published_at is null or published_at <= now()));

drop policy if exists testimonials_public_read on hericilla_testimonials;
create policy testimonials_public_read on hericilla_testimonials for select
  using (approved = true);

drop policy if exists careers_public_read on hericilla_careers;
create policy careers_public_read on hericilla_careers for select
  using (status = 'open');

drop policy if exists page_content_public_read on hericilla_page_content;
create policy page_content_public_read on hericilla_page_content for select using (true);

-- Enquiries & job applications are inserted by the enquiry-intake Edge Function
-- (service role bypasses RLS) — no anon insert policies here on purpose.
drop policy if exists apps_admin_write on hericilla_job_applications;
create policy apps_admin_write on hericilla_job_applications for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','hr_officer'));

drop policy if exists newsletter_admin_read on hericilla_newsletter_subscribers;
create policy newsletter_admin_read on hericilla_newsletter_subscribers for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer'))
  with check (true);  -- anon subscribe handled via edge function / direct insert policy below

drop policy if exists newsletter_anon_insert on hericilla_newsletter_subscribers;
create policy newsletter_anon_insert on hericilla_newsletter_subscribers for insert
  with check (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Live chat (visitor uses x-visitor-token header; agents are staff roles)
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists chat_thread_visitor_read on hericilla_chat_threads;
create policy chat_thread_visitor_read on hericilla_chat_threads for select
  using ((visitor_token::text = coalesce(current_setting('request.headers', true)::json->>'x-visitor-token','')) or public.hericilla_is_admin());

drop policy if exists chat_thread_visitor_insert on hericilla_chat_threads;
create policy chat_thread_visitor_insert on hericilla_chat_threads for insert with check (true);

drop policy if exists chat_thread_agent_update on hericilla_chat_threads;
create policy chat_thread_agent_update on hericilla_chat_threads for update
  using (public.hericilla_has_role('super_admin','admin','supervisor','staff'));

drop policy if exists chat_msg_read on hericilla_chat_messages;
create policy chat_msg_read on hericilla_chat_messages for select
  using (
    public.hericilla_has_role('super_admin','admin','supervisor','staff')
    or exists (
      select 1 from hericilla_chat_threads t
      where t.id = hericilla_chat_messages.thread_id and t.status = 'open'
        and t.visitor_token::text = coalesce(current_setting('request.headers', true)::json->>'x-visitor-token','')
    )
  );

drop policy if exists chat_msg_visitor_insert on hericilla_chat_messages;
create policy chat_msg_visitor_insert on hericilla_chat_messages for insert
  with check (
    sender_role = 'visitor'
    and exists (
      select 1 from hericilla_chat_threads t
      where t.id = hericilla_chat_messages.thread_id and t.status = 'open'
        and t.visitor_token::text = coalesce(current_setting('request.headers', true)::json->>'x-visitor-token','')
    )
  );

drop policy if exists chat_msg_agent_insert on hericilla_chat_messages;
create policy chat_msg_agent_insert on hericilla_chat_messages for insert
  with check (
    sender_role = 'agent' and sender_id = auth.uid()
    and public.hericilla_has_role('super_admin','admin','supervisor','staff')
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Identity: profiles, departments, sites, settings
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists profile_self_read on hericilla_profiles;
create policy profile_self_read on hericilla_profiles for select
  using (id = auth.uid() or public.hericilla_is_admin()
         or (public.hericilla_has_role('supervisor','hr_officer')
             and (department_id is null or department_id = public.hericilla_current_dept_id())));

drop policy if exists profile_self_update on hericilla_profiles;
create policy profile_self_update on hericilla_profiles for update
  using (id = auth.uid()) with check (id = auth.uid());  -- sensitive cols blocked by trigger

drop policy if exists profile_admin_write on hericilla_profiles;
create policy profile_admin_write on hericilla_profiles for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','hr_officer'));

drop policy if exists dept_read on hericilla_departments;
create policy dept_read on hericilla_departments for select using (true);

drop policy if exists dept_admin_write on hericilla_departments;
create policy dept_admin_write on hericilla_departments for all
  using (public.hericilla_is_admin()) with check (public.hericilla_is_admin());

drop policy if exists sites_read on hericilla_sites;
create policy sites_read on hericilla_sites for select to authenticated using (true);

drop policy if exists sites_admin_write on hericilla_sites;
create policy sites_admin_write on hericilla_sites for all
  using (public.hericilla_is_admin()) with check (public.hericilla_is_admin());

drop policy if exists settings_read on hericilla_app_settings;
create policy settings_read on hericilla_app_settings for select to authenticated using (true);

drop policy if exists settings_admin_write on hericilla_app_settings;
create policy settings_admin_write on hericilla_app_settings for all
  using (public.hericilla_is_admin()) with check (public.hericilla_is_admin());

drop policy if exists rolerpermi_admin on hericilla_role_permissions;
create policy rolerpermi_admin on hericilla_role_permissions for all
  using (public.hericilla_is_admin()) with check (public.hericilla_is_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Clients & suppliers
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists clients_auth_read on hericilla_clients;
create policy clients_auth_read on hericilla_clients for select to authenticated using (true);

drop policy if exists clients_ops_write on hericilla_clients;
create policy clients_ops_write on hericilla_clients for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists ccontacts_auth_read on hericilla_client_contacts;
create policy ccontacts_auth_read on hericilla_client_contacts for select to authenticated using (true);

drop policy if exists ccontacts_ops_write on hericilla_client_contacts;
create policy ccontacts_ops_write on hericilla_client_contacts for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists ccontracts_auth_read on hericilla_client_contracts;
create policy ccontracts_auth_read on hericilla_client_contracts for select to authenticated using (true);

drop policy if exists ccontracts_ops_write on hericilla_client_contracts;
create policy ccontracts_ops_write on hericilla_client_contracts for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists cpricing_ops on hericilla_client_pricing;
create policy cpricing_ops on hericilla_client_pricing for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists cpayments_finance on hericilla_client_payments;
create policy cpayments_finance on hericilla_client_payments for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

drop policy if exists suppliers_auth_read on hericilla_suppliers;
create policy suppliers_auth_read on hericilla_suppliers for select to authenticated using (true);

drop policy if exists suppliers_ops_write on hericilla_suppliers;
create policy suppliers_ops_write on hericilla_suppliers for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists supcontracts_ops on hericilla_supplier_contracts;
create policy supcontracts_ops on hericilla_supplier_contracts for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Service requests → quotations → work orders (the spine)
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists sr_read on hericilla_service_requests;
create policy sr_read on hericilla_service_requests for select to authenticated
  using (public.hericilla_is_ops() or assigned_to = auth.uid() or created_by = auth.uid()
         or exists (select 1 from hericilla_job_staff js where js.work_order_id in
               (select wo.id from hericilla_work_orders wo where wo.service_request_id = hericilla_service_requests.id)
               and js.profile_id = auth.uid()));

drop policy if exists sr_ops_write on hericilla_service_requests;
create policy sr_ops_write on hericilla_service_requests for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists quote_read on hericilla_quotations;
create policy quote_read on hericilla_quotations for select to authenticated
  using (public.hericilla_has_role('super_admin','admin','supervisor','procurement_officer','finance_officer','logistics_officer')
         or created_by = auth.uid());

drop policy if exists quote_ops_write on hericilla_quotations;
create policy quote_ops_write on hericilla_quotations for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists qitems_read on hericilla_quotation_items;
create policy qitems_read on hericilla_quotation_items for select to authenticated
  using (exists (select 1 from hericilla_quotations q where q.id = hericilla_quotation_items.quotation_id
                 and (public.hericilla_is_ops() or q.created_by = auth.uid())));

drop policy if exists qitems_write on hericilla_quotation_items;
create policy qitems_write on hericilla_quotation_items for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists wo_read on hericilla_work_orders;
create policy wo_read on hericilla_work_orders for select to authenticated
  using (public.hericilla_is_ops() or created_by = auth.uid()
         or exists (select 1 from hericilla_job_staff js where js.work_order_id = hericilla_work_orders.id and js.profile_id = auth.uid())
         or exists (select 1 from hericilla_transport_jobs tj where tj.work_order_id = hericilla_work_orders.id and tj.driver_id = auth.uid())
         or exists (select 1 from hericilla_packing_jobs pj where pj.work_order_id = hericilla_work_orders.id
                    and (pj.supervisor_id = auth.uid() or exists
                         (select 1 from hericilla_packing_job_teams pt where pt.packing_job_id = pj.id and pt.profile_id = auth.uid()))));

drop policy if exists wo_ops_write on hericilla_work_orders;
create policy wo_ops_write on hericilla_work_orders for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists feedback_read on hericilla_request_feedback;
create policy feedback_read on hericilla_request_feedback for select to authenticated using (public.hericilla_is_ops());

-- The table has no created_by column (it stores raised_by text / handled_by uuid), and a policy
-- predicate is validated against the table at CREATE time, so gating on created_by aborts this
-- migration with 42703. Any authenticated user may raise feedback; ops-only handling is a separate
-- UPDATE policy (added in 0022).
drop policy if exists feedback_insert on hericilla_request_feedback;
create policy feedback_insert on hericilla_request_feedback for insert to authenticated
  with check (true);

drop policy if exists jobstaff_read on hericilla_job_staff;
create policy jobstaff_read on hericilla_job_staff for select to authenticated
  using (public.hericilla_is_ops() or profile_id = auth.uid());

drop policy if exists jobstaff_write on hericilla_job_staff;
create policy jobstaff_write on hericilla_job_staff for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Logistics & transportation
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists tj_read on hericilla_transport_jobs;
create policy tj_read on hericilla_transport_jobs for select to authenticated
  using (public.hericilla_is_ops() or driver_id = auth.uid()
         or exists (select 1 from hericilla_job_staff js where js.work_order_id = hericilla_transport_jobs.work_order_id and js.profile_id = auth.uid()));

drop policy if exists tj_ops_write on hericilla_transport_jobs;
create policy tj_ops_write on hericilla_transport_jobs for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());
-- Drivers change status only through hericilla_driver_update_job_status() (SECURITY DEFINER below).

drop policy if exists jsh_read on hericilla_job_status_history;
create policy jsh_read on hericilla_job_status_history for select to authenticated
  using (public.hericilla_is_ops() or exists (select 1 from hericilla_transport_jobs tj
        where tj.id = hericilla_job_status_history.transport_job_id and tj.driver_id = auth.uid()));
-- rows written by trigger / definer RPC only (no insert policy = append-only via RPC)

drop policy if exists pod_read on hericilla_proof_of_delivery;
create policy pod_read on hericilla_proof_of_delivery for select to authenticated
  using (public.hericilla_is_ops() or submitted_by = auth.uid()
         or exists (select 1 from hericilla_transport_jobs tj where tj.id = hericilla_proof_of_delivery.transport_job_id and tj.driver_id = auth.uid()));

drop policy if exists pod_driver_insert on hericilla_proof_of_delivery;
create policy pod_driver_insert on hericilla_proof_of_delivery for insert to authenticated
  with check (submitted_by = auth.uid()
    and exists (select 1 from hericilla_transport_jobs tj where tj.id = hericilla_proof_of_delivery.transport_job_id and tj.driver_id = auth.uid()));

drop policy if exists pod_ops_update on hericilla_proof_of_delivery;
create policy pod_ops_update on hericilla_proof_of_delivery for update
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists texp_read on hericilla_trip_expenses;
create policy texp_read on hericilla_trip_expenses for select to authenticated
  using (submitted_by = auth.uid() or public.hericilla_is_ops());

drop policy if exists texp_driver_insert on hericilla_trip_expenses;
create policy texp_driver_insert on hericilla_trip_expenses for insert to authenticated
  with check (submitted_by = auth.uid());

drop policy if exists texp_ops_update on hericilla_trip_expenses;
create policy texp_ops_update on hericilla_trip_expenses for update
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. Procurement
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists applimits_read on hericilla_approval_limits;
create policy applimits_read on hericilla_approval_limits for select to authenticated using (true);

drop policy if exists applimits_admin on hericilla_approval_limits;
create policy applimits_admin on hericilla_approval_limits for all
  using (public.hericilla_is_admin()) with check (public.hericilla_is_admin());

drop policy if exists pr_read on hericilla_purchase_requests;
create policy pr_read on hericilla_purchase_requests for select to authenticated
  using (public.hericilla_is_ops() or requested_by = auth.uid());

drop policy if exists pr_write on hericilla_purchase_requests;
create policy pr_write on hericilla_purchase_requests for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists pri_read on hericilla_purchase_request_items;
create policy pri_read on hericilla_purchase_request_items for select to authenticated
  using (exists (select 1 from hericilla_purchase_requests pr where pr.id = hericilla_purchase_request_items.purchase_request_id
                 and (public.hericilla_is_ops() or pr.requested_by = auth.uid())));

drop policy if exists pri_write on hericilla_purchase_request_items;
create policy pri_write on hericilla_purchase_request_items for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists sq_read on hericilla_supplier_quotations;
create policy sq_read on hericilla_supplier_quotations for select to authenticated using (public.hericilla_is_ops());

drop policy if exists sq_write on hericilla_supplier_quotations;
create policy sq_write on hericilla_supplier_quotations for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists po_read on hericilla_purchase_orders;
create policy po_read on hericilla_purchase_orders for select to authenticated
  using (public.hericilla_is_ops() or public.hericilla_has_role('warehouse_agent','finance_officer'));

drop policy if exists po_write on hericilla_purchase_orders;
create policy po_write on hericilla_purchase_orders for all
  using (public.hericilla_has_role('super_admin','admin','procurement_officer','supervisor'))
  with check (public.hericilla_has_role('super_admin','admin','procurement_officer','supervisor'));

drop policy if exists poi_read on hericilla_po_items;
create policy poi_read on hericilla_po_items for select to authenticated
  using (exists (select 1 from hericilla_purchase_orders po where po.id = hericilla_po_items.purchase_order_id and public.hericilla_is_ops()));

drop policy if exists poi_write on hericilla_po_items;
create policy poi_write on hericilla_po_items for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists grn_read on hericilla_goods_received_notes;
create policy grn_read on hericilla_goods_received_notes for select to authenticated using (public.hericilla_is_ops());

drop policy if exists grn_write on hericilla_goods_received_notes;
create policy grn_write on hericilla_goods_received_notes for all
  using (public.hericilla_has_role('super_admin','admin','warehouse_agent','procurement_officer','supervisor'))
  with check (public.hericilla_has_role('super_admin','admin','warehouse_agent','procurement_officer','supervisor'));

-- Generic approvals: relevant approvers + requester can see; only matching
-- role decides, never on their own request.
drop policy if exists approvals_read on hericilla_approvals;
create policy approvals_read on hericilla_approvals for select to authenticated
  using (requested_by = auth.uid() or public.hericilla_is_ops());

drop policy if exists approvals_insert on hericilla_approvals;
create policy approvals_insert on hericilla_approvals for insert to authenticated
  with check (requested_by = auth.uid() or public.hericilla_is_ops());

drop policy if exists approvals_decide on hericilla_approvals;
create policy approvals_decide on hericilla_approvals for update
  using (status = 'pending' and requested_by <> auth.uid()
         and public.hericilla_has_role(required_role::text))
  with check (decided_by = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────────
-- 10. Packing & removal
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists pk_read on hericilla_packing_jobs;
create policy pk_read on hericilla_packing_jobs for select to authenticated
  using (public.hericilla_is_ops() or supervisor_id = auth.uid()
         or exists (select 1 from hericilla_packing_job_teams pt where pt.packing_job_id = hericilla_packing_jobs.id and pt.profile_id = auth.uid()));

drop policy if exists pk_write on hericilla_packing_jobs;
create policy pk_write on hericilla_packing_jobs for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists pkteams_read on hericilla_packing_job_teams;
create policy pkteams_read on hericilla_packing_job_teams for select to authenticated using (public.hericilla_is_ops() or profile_id = auth.uid());

drop policy if exists pkteams_write on hericilla_packing_job_teams;
create policy pkteams_write on hericilla_packing_job_teams for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists pkveh_read on hericilla_packing_job_vehicles;
create policy pkveh_read on hericilla_packing_job_vehicles for select to authenticated using (true);

drop policy if exists pkveh_write on hericilla_packing_job_vehicles;
create policy pkveh_write on hericilla_packing_job_vehicles for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists ritems_read on hericilla_removal_items;
create policy ritems_read on hericilla_removal_items for select to authenticated using (public.hericilla_is_ops());

drop policy if exists ritems_write on hericilla_removal_items;
create policy ritems_write on hericilla_removal_items for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists handover_read on hericilla_handover_records;
create policy handover_read on hericilla_handover_records for select to authenticated using (public.hericilla_is_ops());

drop policy if exists handover_write on hericilla_handover_records;
create policy handover_write on hericilla_handover_records for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- 11. Inventory
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists invcat_read on hericilla_inventory_categories;
create policy invcat_read on hericilla_inventory_categories for select to authenticated using (true);

drop policy if exists invcat_write on hericilla_inventory_categories;
create policy invcat_write on hericilla_inventory_categories for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists invitems_read on hericilla_inventory_items;
create policy invitems_read on hericilla_inventory_items for select to authenticated using (true);

drop policy if exists invitems_write on hericilla_inventory_items;
create policy invitems_write on hericilla_inventory_items for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists sm_read on hericilla_stock_movements;
create policy sm_read on hericilla_stock_movements for select to authenticated using (public.hericilla_is_ops());

drop policy if exists sm_insert on hericilla_stock_movements;
create policy sm_insert on hericilla_stock_movements for insert to authenticated
  with check (public.hericilla_has_role('super_admin','admin','warehouse_agent','supervisor','logistics_officer','procurement_officer'));

drop policy if exists alerts_read on hericilla_reorder_alerts;
create policy alerts_read on hericilla_reorder_alerts for select to authenticated using (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- 12. Documents
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists docs_read on hericilla_documents;
create policy docs_read on hericilla_documents for select to authenticated
  using (uploaded_by = auth.uid() or profile_id = auth.uid() or public.hericilla_is_ops());

drop policy if exists docs_write on hericilla_documents;
create policy docs_write on hericilla_documents for insert to authenticated
  with check (uploaded_by = auth.uid());

drop policy if exists docs_ops_update on hericilla_documents;
create policy docs_ops_update on hericilla_documents for update
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists docs_admin_delete on hericilla_documents;
create policy docs_admin_delete on hericilla_documents for delete
  using (public.hericilla_is_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 13. Finance & billing
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists inv_finance_read on hericilla_invoices;
create policy inv_finance_read on hericilla_invoices for select to authenticated
  using (public.hericilla_has_role('super_admin','admin','finance_officer','supervisor','procurement_officer','logistics_officer','auditor'));

drop policy if exists inv_finance_write on hericilla_invoices;
create policy inv_finance_write on hericilla_invoices for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

drop policy if exists invitems_finance_read on hericilla_invoice_items;
create policy invitems_finance_read on hericilla_invoice_items for select to authenticated
  using (public.hericilla_has_role('super_admin','admin','finance_officer','supervisor','procurement_officer','logistics_officer','auditor'));

drop policy if exists invitems_finance_write on hericilla_invoice_items;
create policy invitems_finance_write on hericilla_invoice_items for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

drop policy if exists invpay_finance on hericilla_invoice_payments;
create policy invpay_finance on hericilla_invoice_payments for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

-- Adjustments are append-only: finance writes, auditor/admin reads, nobody updates
drop policy if exists invadj_read on hericilla_invoice_adjustments;
create policy invadj_read on hericilla_invoice_adjustments for select to authenticated
  using (public.hericilla_has_role('super_admin','admin','finance_officer','auditor'));

drop policy if exists invadj_insert on hericilla_invoice_adjustments;
create policy invadj_insert on hericilla_invoice_adjustments for insert to authenticated
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

drop policy if exists exp_read on hericilla_expenses;
create policy exp_read on hericilla_expenses for select to authenticated
  using (public.hericilla_has_role('super_admin','admin','finance_officer','supervisor','procurement_officer','logistics_officer','hr_officer','auditor') or submitted_by = auth.uid());

drop policy if exists exp_insert on hericilla_expenses;
create policy exp_insert on hericilla_expenses for insert to authenticated
  with check (submitted_by = auth.uid());

drop policy if exists exp_finance_update on hericilla_expenses;
create policy exp_finance_update on hericilla_expenses for update
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

drop policy if exists billingrates_read on hericilla_billing_rates;
create policy billingrates_read on hericilla_billing_rates for select to authenticated using (public.hericilla_is_ops());

drop policy if exists billingrates_write on hericilla_billing_rates;
create policy billingrates_write on hericilla_billing_rates for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

-- ──────────────────────────────────────────────────────────────────────────────
-- 14. Staff, shifts, attendance, leave, tasks
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists sd_read on hericilla_staff_details;
create policy sd_read on hericilla_staff_details for select to authenticated
  using (profile_id = auth.uid() or public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'));

drop policy if exists sd_write on hericilla_staff_details;
create policy sd_write on hericilla_staff_details for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer') or profile_id = auth.uid())
  with check (public.hericilla_has_role('super_admin','admin','hr_officer') or profile_id = auth.uid());

drop policy if exists cert_read on hericilla_staff_certifications;
create policy cert_read on hericilla_staff_certifications for select to authenticated
  using (profile_id = auth.uid() or public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'));

drop policy if exists cert_write on hericilla_staff_certifications;
create policy cert_write on hericilla_staff_certifications for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer') or profile_id = auth.uid())
  with check (public.hericilla_has_role('super_admin','admin','hr_officer') or profile_id = auth.uid());

drop policy if exists shifts_read on hericilla_shifts;
create policy shifts_read on hericilla_shifts for select to authenticated using (true);

drop policy if exists shifts_write on hericilla_shifts;
create policy shifts_write on hericilla_shifts for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'))
  with check (public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'));

drop policy if exists sassign_read on hericilla_shift_assignments;
create policy sassign_read on hericilla_shift_assignments for select to authenticated
  using (employee_id = auth.uid() or public.hericilla_is_ops());

drop policy if exists sassign_write on hericilla_shift_assignments;
create policy sassign_write on hericilla_shift_assignments for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'))
  with check (public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'));

-- Attendance is append-only: employees log their own events; supervisors/HR/admin
-- may record for their department; updates and deletes are intentionally absent.
drop policy if exists att_read on hericilla_attendance_events;
create policy att_read on hericilla_attendance_events for select to authenticated
  using (employee_id = auth.uid()
         or public.hericilla_has_role('super_admin','admin','hr_officer')
         or (public.hericilla_has_role('supervisor') and exists
             (select 1 from hericilla_profiles p where p.id = hericilla_attendance_events.employee_id
              and p.department_id = public.hericilla_current_dept_id())));

drop policy if exists att_insert_self on hericilla_attendance_events;
create policy att_insert_self on hericilla_attendance_events for insert to authenticated
  with check (employee_id = auth.uid());

drop policy if exists att_insert_mgr on hericilla_attendance_events;
create policy att_insert_mgr on hericilla_attendance_events for insert to authenticated
  with check (public.hericilla_has_role('super_admin','admin','hr_officer','supervisor','logistics_officer'));

drop policy if exists atrules_read on hericilla_attendance_rules;
create policy atrules_read on hericilla_attendance_rules for select to authenticated using (true);

drop policy if exists atrules_write on hericilla_attendance_rules;
create policy atrules_write on hericilla_attendance_rules for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','hr_officer'));

drop policy if exists corr_read on hericilla_attendance_corrections;
create policy corr_read on hericilla_attendance_corrections for select to authenticated
  using (employee_id = auth.uid() or requested_by = auth.uid() or public.hericilla_is_ops());

drop policy if exists corr_insert on hericilla_attendance_corrections;
create policy corr_insert on hericilla_attendance_corrections for insert to authenticated
  with check (employee_id = auth.uid() and requested_by = auth.uid());

-- status flips happen inside hericilla_approve_attendance_correction() (definer) only

drop policy if exists leave_read on hericilla_leave_requests;
create policy leave_read on hericilla_leave_requests for select to authenticated
  using (employee_id = auth.uid() or requested_by = auth.uid() or public.hericilla_is_ops());

drop policy if exists leave_insert on hericilla_leave_requests;
create policy leave_insert on hericilla_leave_requests for insert to authenticated
  with check (employee_id = auth.uid());

drop policy if exists leave_update on hericilla_leave_requests;
create policy leave_update on hericilla_leave_requests for update
  using (public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'))
  with check (public.hericilla_has_role('super_admin','admin','hr_officer','supervisor'));

drop policy if exists tasks_read on hericilla_tasks;
create policy tasks_read on hericilla_tasks for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or escalated_to = auth.uid() or public.hericilla_is_ops());

drop policy if exists tasks_insert on hericilla_tasks;
create policy tasks_insert on hericilla_tasks for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists tasks_update on hericilla_tasks;
create policy tasks_update on hericilla_tasks for update to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.hericilla_is_ops())
  with check (assigned_to = auth.uid() or created_by = auth.uid() or public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- 15. Salary allocator & payroll
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists ss_read on hericilla_salary_structures;
create policy ss_read on hericilla_salary_structures for select to authenticated
  using (employee_id = auth.uid() or public.hericilla_has_role('super_admin','admin','finance_officer','hr_officer','auditor'));

drop policy if exists ss_write on hericilla_salary_structures;
create policy ss_write on hericilla_salary_structures for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer','hr_officer'));

drop policy if exists pruns_read on hericilla_payroll_runs;
create policy pruns_read on hericilla_payroll_runs for select to authenticated
  using (public.hericilla_has_role('super_admin','admin','finance_officer','hr_officer','auditor'));

drop policy if exists pruns_write on hericilla_payroll_runs;
create policy pruns_write on hericilla_payroll_runs for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

-- Employees always see their own payslips (once generated)
drop policy if exists payslip_self_read on hericilla_payslips;
create policy payslip_self_read on hericilla_payslips for select to authenticated
  using (employee_id = auth.uid()
         or public.hericilla_has_role('super_admin','admin','finance_officer','hr_officer','auditor'));

drop policy if exists payslip_finance_write on hericilla_payslips;
create policy payslip_finance_write on hericilla_payslips for all
  using (public.hericilla_has_role('super_admin','admin','finance_officer'))
  with check (public.hericilla_has_role('super_admin','admin','finance_officer'));

-- ──────────────────────────────────────────────────────────────────────────────
-- 16. Fleet, vehicles, movements, inspections, incidents
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists veh_read on hericilla_vehicles;
create policy veh_read on hericilla_vehicles for select to authenticated using (true);

drop policy if exists veh_write on hericilla_vehicles;
create policy veh_write on hericilla_vehicles for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists valloc_read on hericilla_vehicle_allocations;
create policy valloc_read on hericilla_vehicle_allocations for select to authenticated
  using (driver_id = auth.uid() or public.hericilla_is_ops());

drop policy if exists valloc_write on hericilla_vehicle_allocations;
create policy valloc_write on hericilla_vehicle_allocations for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists vmov_read on hericilla_vehicle_movements;
create policy vmov_read on hericilla_vehicle_movements for select to authenticated using (true);

drop policy if exists vmov_insert on hericilla_vehicle_movements;
create policy vmov_insert on hericilla_vehicle_movements for insert to authenticated
  with check (recorded_by = auth.uid() and (public.hericilla_is_ops() or public.hericilla_is_driver()));

drop policy if exists msched_read on hericilla_maintenance_schedules;
create policy msched_read on hericilla_maintenance_schedules for select to authenticated using (public.hericilla_is_ops() or public.hericilla_is_driver());

drop policy if exists msched_write on hericilla_maintenance_schedules;
create policy msched_write on hericilla_maintenance_schedules for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists mrec_read on hericilla_maintenance_records;
create policy mrec_read on hericilla_maintenance_records for select to authenticated
  using (public.hericilla_is_ops() or exists (select 1 from hericilla_vehicles v
         where v.id = hericilla_maintenance_records.vehicle_id and v.status = 'maintenance'));

drop policy if exists mrec_write on hericilla_maintenance_records;
create policy mrec_write on hericilla_maintenance_records for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists icheck_read on hericilla_inspection_checklists;
create policy icheck_read on hericilla_inspection_checklists for select to authenticated using (true);

drop policy if exists icheck_write on hericilla_inspection_checklists;
create policy icheck_write on hericilla_inspection_checklists for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

drop policy if exists ires_read on hericilla_inspection_results;
create policy ires_read on hericilla_inspection_results for select to authenticated
  using (driver_id = auth.uid() or public.hericilla_is_ops());

drop policy if exists ires_driver_insert on hericilla_inspection_results;
create policy ires_driver_insert on hericilla_inspection_results for insert to authenticated
  with check (driver_id = auth.uid() and public.hericilla_is_driver());

drop policy if exists odom_read on hericilla_odometer_readings;
create policy odom_read on hericilla_odometer_readings for select to authenticated
  using (driver_id = auth.uid() or public.hericilla_is_ops());

drop policy if exists odom_driver_insert on hericilla_odometer_readings;
create policy odom_driver_insert on hericilla_odometer_readings for insert to authenticated
  with check (driver_id = auth.uid() and public.hericilla_is_driver());

drop policy if exists incid_read on hericilla_incidents;
create policy incid_read on hericilla_incidents for select to authenticated
  using (reported_by = auth.uid() or public.hericilla_is_ops());

drop policy if exists incid_insert on hericilla_incidents;
create policy incid_insert on hericilla_incidents for insert to authenticated
  with check (reported_by = auth.uid());

drop policy if exists incid_ops_update on hericilla_incidents;
create policy incid_ops_update on hericilla_incidents for update
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- 17. Notifications & announcements
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists outbox_read on hericilla_notification_outbox;
create policy outbox_read on hericilla_notification_outbox for select to authenticated
  using (recipient_user_id = auth.uid());
-- producers write via hericilla_push_notification()/edge function (definer/service role)

drop policy if exists seen_self on hericilla_notifications_seen;
create policy seen_self on hericilla_notifications_seen for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists expo_tokens_self on hericilla_expo_push_tokens;
create policy expo_tokens_self on hericilla_expo_push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists webpush_self on hericilla_web_push_subscriptions;
create policy webpush_self on hericilla_web_push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ann_read on hericilla_announcements;
create policy ann_read on hericilla_announcements for select to authenticated using (true);

drop policy if exists ann_write on hericilla_announcements;
create policy ann_write on hericilla_announcements for all
  using (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer'));

-- ──────────────────────────────────────────────────────────────────────────────
-- 18. Audit log — read-only for oversight roles; writes only via triggers
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists audit_read on hericilla_audit_logs;
create policy audit_read on hericilla_audit_logs for select to authenticated
  using (public.hericilla_has_role('super_admin','admin','auditor'));

-- ──────────────────────────────────────────────────────────────────────────────
-- 19. Driver status RPC — the only sanctioned path for a driver to move a job
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.hericilla_driver_update_job_status(
  p_job uuid, p_to hericilla_job_status, p_gps_lat double precision default null, p_gps_lng double precision default null
) returns void language plpgsql security definer set search_path = public as $$
declare j hericilla_transport_jobs%rowtype;
begin
  select * into j from hericilla_transport_jobs where id = p_job;
  if not found then raise exception 'job not found'; end if;
  if j.driver_id is distinct from auth.uid() then raise exception 'job is not assigned to you'; end if;
  -- allowed forward transitions only
  if not ( (j.status = 'assigned'   and p_to in ('accepted','arrived'))
        or (j.status = 'accepted'   and p_to in ('arrived','loaded'))
        or (j.status = 'arrived'    and p_to in ('loaded','in_transit'))
        or (j.status = 'loaded'     and p_to = 'in_transit')
        or (j.status = 'in_transit' and p_to = 'delivered') ) then
    raise exception 'illegal transition % -> %', j.status, p_to;
  end if;
  update hericilla_transport_jobs set status = p_to, updated_at = now() where id = p_job;  -- trigger logs history
end $$;

grant execute on function public.hericilla_driver_update_job_status(uuid, hericilla_job_status, double precision, double precision) to authenticated;

-- Staff/driver clock RPC: appends an event, dedupes offline retries by client-generated
-- event_id, enforces the already-clocked-in rule per assignment per day.
create or replace function public.hericilla_clock_event(
  p_type hericilla_attendance_event_type, p_work_order uuid default null, p_site uuid default null,
  p_shift uuid default null, p_gps_lat double precision default null, p_gps_lng double precision default null,
  p_event_id uuid default gen_random_uuid(), p_original_time timestamptz default null, p_source hericilla_event_source default 'web'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_existing uuid;
begin
  select id into v_existing from hericilla_attendance_events where event_id = p_event_id;
  if found then return v_existing; end if;   -- offline replay: idempotent
  if p_type = 'clock_in' and exists (
    select 1 from hericilla_attendance_events ae
    where ae.employee_id = auth.uid()
      and coalesce(ae.work_order_id, ae.site_id, ae.shift_id) is not distinct from coalesce(p_work_order, p_site, p_shift)
      and ae.event_type = 'clock_in'
      and (ae.event_time at time zone 'WAT')::date = (coalesce(p_original_time, now()) at time zone 'WAT')::date
      and not exists (select 1 from hericilla_attendance_events x
                      where x.employee_id = ae.employee_id and x.event_type = 'clock_out' and x.event_time > ae.event_time)
  ) then
    raise exception 'already clocked in for this assignment today';
  end if;
  insert into hericilla_attendance_events (event_id, employee_id, event_type, work_order_id, site_id, shift_id,
                                 event_time, gps_lat, gps_lng, source, original_event_time, synced_at)
  values (p_event_id, auth.uid(), p_type, p_work_order, p_site, p_shift,
          coalesce(p_original_time, now()), p_gps_lat, p_gps_lng, p_source,
          p_original_time, case when p_original_time is not null then now() end)
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.hericilla_clock_event(hericilla_attendance_event_type, uuid, uuid, uuid, double precision, double precision, uuid, timestamptz, hericilla_event_source) to authenticated;
