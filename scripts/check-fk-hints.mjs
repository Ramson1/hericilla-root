#!/usr/bin/env node
// check-fk-hints.mjs — validates every PostgREST foreign-key embed hint in the portals and
// Edge Functions against the actual constraint names in the database.
//
// Why: when two FKs point at the same table (hericilla_expenses.submitted_by and
// .approved_by both reference hericilla_profiles) the embed must name the constraint:
//   hericilla_profiles!hericilla_expenses_submitted_by_fkey(full_name)
// PostgREST matches that hint against pg_constraint verbatim, so the shorter
// "!expenses_submitted_by_fkey" form answers HTTP 400 / PGRST200 — and because the portals
// read `data ?? []`, the page renders "no records" instead of an error. That one typo made
// the whole Expenses tab unusable and hid rows that had been written correctly.
//
// Usage:  node scripts/check-fk-hints.mjs
// Refresh the constraint map after any migration that adds or renames a foreign key:
//   npx supabase db query --linked "select conrelid::regclass::text as tbl,
//     string_agg(conname, ',' order by conname) as fks from pg_constraint where contype='f'
//     and conrelid::regclass::text like 'hericilla_%' group by 1 order by 1"

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Child table -> its foreign key constraint names, read from the live database. */
const FK_CONSTRAINTS = {
  "hericilla_announcements": "hericilla_announcements_created_by_fkey",
  "hericilla_approvals": "hericilla_approvals_decided_by_fkey,hericilla_approvals_requested_by_fkey",
  "hericilla_attendance_corrections": "hericilla_attendance_corrections_decided_by_fkey,hericilla_attendance_corrections_employee_id_fkey,hericilla_attendance_corrections_requested_by_fkey",
  "hericilla_attendance_events": "hericilla_attendance_events_employee_id_fkey,hericilla_attendance_events_shift_id_fkey,hericilla_attendance_events_site_id_fkey,hericilla_attendance_events_work_order_id_fkey",
  "hericilla_billing_rates": "hericilla_billing_rates_client_id_fkey",
  "hericilla_blog_posts": "hericilla_blog_posts_author_id_fkey",
  "hericilla_chat_messages": "hericilla_chat_messages_sender_id_fkey,hericilla_chat_messages_thread_id_fkey",
  "hericilla_chat_threads": "hericilla_chat_threads_assigned_admin_fkey",
  "hericilla_client_contacts": "hericilla_client_contacts_client_id_fkey",
  "hericilla_client_contracts": "hericilla_client_contracts_client_id_fkey",
  "hericilla_client_payments": "hericilla_client_payments_client_id_fkey,hericilla_client_payments_recorded_by_fkey",
  "hericilla_client_pricing": "hericilla_client_pricing_client_id_fkey",
  "hericilla_clients": "hericilla_clients_created_by_fkey",
  "hericilla_departments": "hericilla_departments_head_profile_id_fkey",
  "hericilla_documents": "hericilla_documents_client_id_fkey,hericilla_documents_packing_job_id_fkey,hericilla_documents_profile_id_fkey,hericilla_documents_purchase_order_id_fkey,hericilla_documents_quotation_id_fkey,hericilla_documents_supplier_id_fkey,hericilla_documents_transport_job_id_fkey,hericilla_documents_uploaded_by_fkey,hericilla_documents_work_order_id_fkey",
  "hericilla_enquiries": "hericilla_enquiries_assigned_to_fkey,hericilla_enquiries_converted_to_service_request_id_fkey",
  "hericilla_expenses": "hericilla_expenses_approved_by_fkey,hericilla_expenses_invoice_id_fkey,hericilla_expenses_submitted_by_fkey,hericilla_expenses_supplier_id_fkey,hericilla_expenses_work_order_id_fkey",
  "hericilla_expo_push_tokens": "hericilla_expo_push_tokens_user_id_fkey",
  "hericilla_goods_received_notes": "hericilla_goods_received_notes_purchase_order_id_fkey,hericilla_goods_received_notes_verified_by_fkey",
  "hericilla_handover_records": "hericilla_handover_records_packing_job_id_fkey",
  "hericilla_incidents": "hericilla_incidents_reported_by_fkey,hericilla_incidents_transport_job_id_fkey,hericilla_incidents_vehicle_id_fkey",
  "hericilla_inspection_results": "hericilla_inspection_results_checklist_id_fkey,hericilla_inspection_results_driver_id_fkey,hericilla_inspection_results_transport_job_id_fkey,hericilla_inspection_results_vehicle_id_fkey",
  "hericilla_inventory_items": "hericilla_inventory_items_category_id_fkey",
  "hericilla_invoice_adjustments": "hericilla_invoice_adjustments_invoice_id_fkey,hericilla_invoice_adjustments_made_by_fkey",
  "hericilla_invoice_items": "hericilla_invoice_items_invoice_id_fkey",
  "hericilla_invoice_payments": "hericilla_invoice_payments_invoice_id_fkey,hericilla_invoice_payments_recorded_by_fkey",
  "hericilla_invoices": "hericilla_invoices_client_id_fkey,hericilla_invoices_created_by_fkey,hericilla_invoices_quotation_id_fkey,hericilla_invoices_work_order_id_fkey",
  "hericilla_job_applications": "hericilla_job_applications_career_id_fkey,hericilla_job_applications_reviewed_by_fkey",
  "hericilla_job_staff": "hericilla_job_staff_profile_id_fkey,hericilla_job_staff_work_order_id_fkey",
  "hericilla_job_status_history": "hericilla_job_status_history_actor_id_fkey,hericilla_job_status_history_transport_job_id_fkey",
  "hericilla_leave_requests": "hericilla_leave_requests_decided_by_fkey,hericilla_leave_requests_employee_id_fkey,hericilla_leave_requests_requested_by_fkey",
  "hericilla_maintenance_records": "hericilla_maintenance_records_recorded_by_fkey,hericilla_maintenance_records_vehicle_id_fkey",
  "hericilla_maintenance_schedules": "hericilla_maintenance_schedules_vehicle_id_fkey",
  "hericilla_notification_outbox": "hericilla_notification_outbox_recipient_user_id_fkey",
  "hericilla_notifications_seen": "hericilla_notifications_seen_outbox_id_fkey,hericilla_notifications_seen_user_id_fkey",
  "hericilla_odometer_readings": "hericilla_odometer_readings_driver_id_fkey,hericilla_odometer_readings_transport_job_id_fkey,hericilla_odometer_readings_vehicle_id_fkey",
  "hericilla_packing_job_teams": "hericilla_packing_job_teams_packing_job_id_fkey,hericilla_packing_job_teams_profile_id_fkey",
  "hericilla_packing_job_vehicles": "fk_pjv_vehicle,hericilla_packing_job_vehicles_packing_job_id_fkey",
  "hericilla_packing_jobs": "hericilla_packing_jobs_created_by_fkey,hericilla_packing_jobs_supervisor_id_fkey,hericilla_packing_jobs_work_order_id_fkey",
  "hericilla_page_content": "hericilla_page_content_updated_by_fkey",
  "hericilla_password_resets": "hericilla_password_resets_profile_id_fkey",
  "hericilla_payroll_runs": "hericilla_payroll_runs_approved_by_fkey,hericilla_payroll_runs_submitted_by_fkey",
  "hericilla_payslips": "hericilla_payslips_approved_by_fkey,hericilla_payslips_employee_id_fkey,hericilla_payslips_payroll_run_id_fkey",
  "hericilla_po_items": "hericilla_po_items_purchase_order_id_fkey",
  "hericilla_profiles": "hericilla_profiles_department_id_fkey",
  "hericilla_proof_of_delivery": "hericilla_proof_of_delivery_submitted_by_fkey,hericilla_proof_of_delivery_transport_job_id_fkey,hericilla_proof_of_delivery_verified_by_fkey",
  "hericilla_purchase_orders": "hericilla_purchase_orders_approved_by_fkey,hericilla_purchase_orders_client_id_fkey,hericilla_purchase_orders_created_by_fkey,hericilla_purchase_orders_purchase_request_id_fkey,hericilla_purchase_orders_supplier_id_fkey,hericilla_purchase_orders_work_order_id_fkey",
  "hericilla_purchase_request_items": "hericilla_purchase_request_items_purchase_request_id_fkey",
  "hericilla_purchase_requests": "hericilla_purchase_requests_client_id_fkey,hericilla_purchase_requests_requested_by_fkey,hericilla_purchase_requests_work_order_id_fkey",
  "hericilla_quotation_items": "hericilla_quotation_items_quotation_id_fkey",
  "hericilla_quotations": "hericilla_quotations_approved_by_fkey,hericilla_quotations_client_id_fkey,hericilla_quotations_created_by_fkey,hericilla_quotations_service_request_id_fkey",
  "hericilla_removal_items": "hericilla_removal_items_packing_job_id_fkey",
  "hericilla_reorder_alerts": "hericilla_reorder_alerts_acknowledged_by_fkey,hericilla_reorder_alerts_item_id_fkey",
  "hericilla_request_feedback": "hericilla_request_feedback_handled_by_fkey,hericilla_request_feedback_service_request_id_fkey",
  "hericilla_salary_structures": "hericilla_salary_structures_created_by_fkey,hericilla_salary_structures_employee_id_fkey",
  "hericilla_service_requests": "hericilla_service_requests_assigned_department_id_fkey,hericilla_service_requests_assigned_to_fkey,hericilla_service_requests_client_id_fkey,hericilla_service_requests_created_by_fkey",
  "hericilla_shift_assignments": "hericilla_shift_assignments_created_by_fkey,hericilla_shift_assignments_employee_id_fkey,hericilla_shift_assignments_shift_id_fkey,hericilla_shift_assignments_site_id_fkey,hericilla_shift_assignments_work_order_id_fkey",
  "hericilla_shifts": "hericilla_shifts_default_site_id_fkey",
  "hericilla_staff_certifications": "hericilla_staff_certifications_profile_id_fkey",
  "hericilla_staff_details": "hericilla_staff_details_profile_id_fkey",
  "hericilla_stock_movements": "hericilla_stock_movements_actor_id_fkey,hericilla_stock_movements_client_id_fkey,hericilla_stock_movements_item_id_fkey,hericilla_stock_movements_work_order_id_fkey",
  "hericilla_supplier_contracts": "hericilla_supplier_contracts_supplier_id_fkey",
  "hericilla_supplier_quotations": "hericilla_supplier_quotations_purchase_request_id_fkey,hericilla_supplier_quotations_supplier_id_fkey",
  "hericilla_suppliers": "hericilla_suppliers_created_by_fkey",
  "hericilla_tasks": "hericilla_tasks_assigned_to_fkey,hericilla_tasks_created_by_fkey,hericilla_tasks_escalated_to_fkey,hericilla_tasks_work_order_id_fkey",
  "hericilla_transport_jobs": "hericilla_transport_jobs_created_by_fkey,hericilla_transport_jobs_destination_site_id_fkey,hericilla_transport_jobs_driver_id_fkey,hericilla_transport_jobs_pickup_site_id_fkey,hericilla_transport_jobs_team_lead_id_fkey,hericilla_transport_jobs_work_order_id_fkey",
  "hericilla_trip_expenses": "hericilla_trip_expenses_approved_by_fkey,hericilla_trip_expenses_submitted_by_fkey,hericilla_trip_expenses_transport_job_id_fkey",
  "hericilla_user_credentials": "hericilla_user_credentials_profile_id_fkey",
  "hericilla_vehicle_allocations": "hericilla_vehicle_allocations_created_by_fkey,hericilla_vehicle_allocations_driver_id_fkey,hericilla_vehicle_allocations_site_id_fkey,hericilla_vehicle_allocations_vehicle_id_fkey,hericilla_vehicle_allocations_work_order_id_fkey",
  "hericilla_vehicle_movements": "hericilla_vehicle_movements_allocation_id_fkey,hericilla_vehicle_movements_recorded_by_fkey,hericilla_vehicle_movements_vehicle_id_fkey",
  "hericilla_web_push_subscriptions": "hericilla_web_push_subscriptions_user_id_fkey",
  "hericilla_work_orders": "hericilla_work_orders_client_id_fkey,hericilla_work_orders_created_by_fkey,hericilla_work_orders_quotation_id_fkey,hericilla_work_orders_service_request_id_fkey",
};

/** PostgREST cardinality modifiers that legally follow "!" and are not constraint names. */
const MODIFIERS = new Set(["inner", "left", "obtained"]);

const ROOT = process.cwd();
const SCAN_DIRS = ["apps", "supabase/functions", "packages"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".expo", "dist", "build", "coverage"]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

/** `.from("table")` plus the chain that follows it, so hints are attributed to the queried table.
 *  The chain must stop at the next `.from(` — queries written as siblings inside a Promise.all
 *  are not separated by ";", and bleeding past one attributes an embed to the wrong table. */
const FROM_RE = /\.from\(\s*["']([a-z0-9_]+)["']\)([\s\S]{0,900}?)(?:\.from\(\s*["']|[;]|\n\s*\}\s*\)|\n\s*return\b|$)/g;
const SELECT_RE = /\.select\(\s*["']([^"']+)["']/g;
const HINT_RE = /![a-zA-Z0-9_]+/g;

const ALL_NAMES = new Set(Object.values(FK_CONSTRAINTS).flatMap((v) => v.split(",")));
const problems = [];
const hintsChecked = new Set();

for (const base of SCAN_DIRS) {
  for (const file of walk(join(ROOT, base))) {
    const text = readFileSync(file, "utf8");
    for (const fromMatch of text.matchAll(FROM_RE)) {
      const table = fromMatch[1];
      const chain = fromMatch[2];
      if (!table.startsWith("hericilla_")) continue;
      const chainStart = fromMatch.index + fromMatch[0].indexOf(chain);
      const legal = (FK_CONSTRAINTS[table] ?? "").split(",").filter(Boolean);
      for (const selMatch of chain.matchAll(SELECT_RE)) {
        const select = selMatch[1];
        for (const hit of select.matchAll(HINT_RE)) {
          const hint = hit[0].slice(1);
          if (MODIFIERS.has(hint)) continue;
          hintsChecked.add(`${table} -> ${hint}`);
          if (legal.includes(hint)) continue;
          // Almost always the table prefix was dropped: reconstruct the intended name.
          const guess = ALL_NAMES.has(`hericilla_${hint}`) ? `hericilla_${hint}` : legal.find((n) => n.endsWith(hint)) ?? null;
          const offset = chainStart + selMatch.index + 10 + hit.index;
          const line = text.slice(0, offset).split("\n").length;
          problems.push({ file: relative(ROOT, file), table, hint, guess, line });
        }
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`check-fk-hints: OK — every embed hint is a real constraint name (${hintsChecked.size} hint(s) exercised).`);
  process.exit(0);
}

console.error(`check-fk-hints: ${problems.length} embed hint(s) are not foreign key constraint names on their table:\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}`);
  console.error(`    .from("${p.table}") embed uses !${p.hint}`);
  console.error(`    real constraints on ${p.table}: ${FK_CONSTRAINTS[p.table] ?? "(none — table has no FKs)"}`);
  if (p.guess) console.error(`    fix: !${p.guess}`);
  console.error("");
}
console.error("PostgREST answers HTTP 400 / PGRST200 for these, which the portals render as an empty list.");
process.exit(1);
