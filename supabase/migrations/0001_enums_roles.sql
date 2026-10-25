-- 0001: Enums + reference sequences + reference generator (deny-by-default building blocks)
-- The RBAC helpers live in 0002, not here: a `language sql` function body is parsed and planned at
-- CREATE FUNCTION time, so the table it reads (hericilla_profiles) must already exist.

-- ===== Enums (idempotent) =====
do $$ begin create type hericilla_app_role as enum ('super_admin','admin','supervisor','procurement_officer','finance_officer','logistics_officer','warehouse_agent','hr_officer','staff','driver','auditor'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_service_type as enum ('logistics','trucking','transportation','procurement','packing_removal','materials_support'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_sr_status as enum ('new','quoted','approved','assigned','in_progress','completed','invoiced','closed','rejected','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_job_status as enum ('assigned','accepted','arrived','loaded','in_transit','delivered','verified','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_packing_stage as enum ('packing','loaded','transit','unloading','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_priority as enum ('low','normal','high','urgent'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_doc_type as enum ('contract','quotation','invoice','purchase_order','receipt','permit','insurance','licence','waybill','delivery_note','pod','completion_report','certificate','other'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_invoice_status as enum ('draft','sent','paid','partial','overdue','void'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_stock_movement_type as enum ('received','issued','returned','transferred','written_off','damaged','missing'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_attendance_event_type as enum ('clock_in','clock_out','break_start','break_end'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_geofence_result as enum ('verified','outside','unchecked'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_event_source as enum ('web','app','offline_sync','admin','correction'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_payroll_run_status as enum ('draft','pending_approval','approved','paid','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_vehicle_type as enum ('flat_bed','low_bed','crane','forklift','truck','van','saloon'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_vehicle_status as enum ('available','allocated','in_use','maintenance','retired'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_movement_type as enum ('out_gate','in_gate','fuel_stop','site_stop'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_pod_outcome as enum ('delivered','rejected','damaged','missing','partial'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_expense_type as enum ('fuel','toll','maintenance','other'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_approval_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_notification_channel as enum ('expo_push','web_push','email','in_app'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_notification_status as enum ('queued','sent','failed','retrying'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_enquiry_type as enum ('quotation','service_enquiry','general'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_enquiry_status as enum ('new','assigned','in_progress','responded','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_leave_type as enum ('annual','sick','unpaid','compassionate','maternity'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_task_status as enum ('open','in_progress','done','blocked'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_incident_type as enum ('accident','breakdown','near_miss','safety','other'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_po_status as enum ('draft','sent','partial','received','closed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_pr_status as enum ('draft','submitted','quoting','pending_approval','approved','rejected','ordered','received','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_supplier_category as enum ('trucking','freight_forwarding','packing_materials','equipment_hire','fuel','security','shipping_agent','general_merchandise','other'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_blog_category as enum ('blog','news','project_update'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_job_app_status as enum ('new','reviewed','shortlisted','rejected','hired'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_wo_status as enum ('open','in_progress','completed','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type hericilla_chat_status as enum ('open','closed'); exception when duplicate_object then null; end $$;

-- ===== Sequences for human-readable references =====
create sequence if not exists ref_enquiry_seq;
create sequence if not exists ref_service_request_seq;
create sequence if not exists ref_work_order_seq;
create sequence if not exists ref_invoice_seq;
create sequence if not exists ref_po_seq;
create sequence if not exists ref_job_seq;

create or replace function public.hericilla_next_ref(kind text)
returns text language plpgsql as $$
declare y text := to_char(now(), 'YYYY');
begin
  case kind
    when 'ENQ' then return 'ENQ-' || y || '-' || lpad(nextval('ref_enquiry_seq')::text, 5, '0');
    when 'SR'  then return 'SR-'  || y || '-' || lpad(nextval('ref_service_request_seq')::text, 5, '0');
    when 'WO'  then return 'WO-'  || y || '-' || lpad(nextval('ref_work_order_seq')::text, 5, '0');
    when 'INV' then return 'INV-' || y || '-' || lpad(nextval('ref_invoice_seq')::text, 5, '0');
    when 'PO'  then return 'PO-'  || y || '-' || lpad(nextval('ref_po_seq')::text, 5, '0');
    when 'JOB' then return 'JOB-' || y || '-' || lpad(nextval('ref_job_seq')::text, 5, '0');
    else raise exception 'unknown ref kind %', kind;
  end case;
end $$;
