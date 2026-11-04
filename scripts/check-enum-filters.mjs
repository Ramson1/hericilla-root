#!/usr/bin/env node
// check-enum-filters.mjs — validates every PostgREST enum filter in the portals and Edge
// Functions against the actual enum domains in the database.
//
// Why: `hericilla_work_orders.status` is (open, in_progress, completed, closed) while
// `hericilla_service_requests.status` is (new, quoted, approved, ...). Copying a status list
// from one table onto the other produces `22P02 invalid input value for enum`, which PostgREST
// raises as a 400 that the UI often swallows — leaving an empty dropdown that reads like
// "no data exists". Two of those bugs shipped before this guard existed.
//
// Usage:  node scripts/check-enum-filters.mjs
// Refresh the domains after any migration that adds an enum value:
//   npx supabase db query --linked "select c.table_name || '.' || c.column_name as col,
//     string_agg(e.enumlabel, ',' order by e.enumsortorder) as vals from information_schema.columns c
//     join pg_type t on t.typname = c.udt_name join pg_enum e on e.enumtypid = t.oid
//     where c.table_schema='public' and c.table_name like 'hericilla_%' group by 1 order by 1"

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Enum-typed columns and their legal labels, read from the live database. */
const ENUMS = {
  "hericilla_approval_limits.role": "super_admin,admin,supervisor,procurement_officer,finance_officer,logistics_officer,warehouse_agent,hr_officer,staff,driver,auditor",
  "hericilla_approvals.required_role": "super_admin,admin,supervisor,procurement_officer,finance_officer,logistics_officer,warehouse_agent,hr_officer,staff,driver,auditor",
  "hericilla_approvals.status": "pending,approved,rejected",
  "hericilla_attendance_corrections.requested_event_type": "clock_in,clock_out,break_start,break_end",
  "hericilla_attendance_corrections.status": "pending,approved,rejected",
  "hericilla_attendance_events.event_type": "clock_in,clock_out,break_start,break_end",
  "hericilla_attendance_events.geofence_result": "verified,outside,unchecked",
  "hericilla_attendance_events.source": "web,app,offline_sync,admin,correction",
  "hericilla_billing_rates.service_type": "logistics,trucking,transportation,procurement,packing_removal,materials_support",
  "hericilla_blog_posts.category": "blog,news,project_update",
  "hericilla_chat_threads.status": "open,closed",
  "hericilla_client_pricing.service_type": "logistics,trucking,transportation,procurement,packing_removal,materials_support",
  "hericilla_documents.doc_type": "contract,quotation,invoice,purchase_order,receipt,permit,insurance,licence,waybill,delivery_note,pod,completion_report,certificate,other",
  "hericilla_enquiries.enquiry_type": "quotation,service_enquiry,general",
  "hericilla_enquiries.service_type": "logistics,trucking,transportation,procurement,packing_removal,materials_support",
  "hericilla_enquiries.status": "new,assigned,in_progress,responded,closed",
  "hericilla_expenses.status": "pending,approved,rejected",
  "hericilla_fleet_board.last_movement": "out_gate,in_gate,fuel_stop,site_stop",
  "hericilla_fleet_board.vehicle_status": "available,allocated,in_use,maintenance,retired",
  "hericilla_fleet_board.vehicle_type": "flat_bed,low_bed,crane,forklift,truck,van,saloon",
  "hericilla_incidents.incident_type": "accident,breakdown,near_miss,safety,other",
  "hericilla_inspection_results.source": "web,app,offline_sync,admin,correction",
  "hericilla_invoices.status": "draft,sent,paid,partial,overdue,void",
  "hericilla_job_applications.status": "new,reviewed,shortlisted,rejected,hired",
  "hericilla_job_margins.service_type": "logistics,trucking,transportation,procurement,packing_removal,materials_support",
  "hericilla_job_margins.status": "open,in_progress,completed,closed",
  "hericilla_job_status_history.from_status": "assigned,accepted,arrived,loaded,in_transit,delivered,verified,closed",
  "hericilla_job_status_history.to_status": "assigned,accepted,arrived,loaded,in_transit,delivered,verified,closed",
  "hericilla_leave_requests.leave_type": "annual,sick,unpaid,compassionate,maternity",
  "hericilla_leave_requests.status": "pending,approved,rejected",
  "hericilla_notification_outbox.status": "queued,sent,failed,retrying",
  "hericilla_packing_jobs.stage": "packing,loaded,transit,unloading,completed",
  "hericilla_payroll_runs.status": "draft,pending_approval,approved,paid,rejected",
  "hericilla_payroll_status.status": "draft,pending_approval,approved,paid,rejected",
  "hericilla_profiles.role": "super_admin,admin,supervisor,procurement_officer,finance_officer,logistics_officer,warehouse_agent,hr_officer,staff,driver,auditor",
  "hericilla_proof_of_delivery.outcome": "delivered,rejected,damaged,missing,partial",
  "hericilla_purchase_orders.status": "draft,sent,partial,received,closed,cancelled",
  "hericilla_purchase_requests.required_approver_role": "super_admin,admin,supervisor,procurement_officer,finance_officer,logistics_officer,warehouse_agent,hr_officer,staff,driver,auditor",
  "hericilla_purchase_requests.status": "draft,submitted,quoting,pending_approval,approved,rejected,ordered,received,closed",
  "hericilla_role_permissions.role": "super_admin,admin,supervisor,procurement_officer,finance_officer,logistics_officer,warehouse_agent,hr_officer,staff,driver,auditor",
  "hericilla_service_requests.priority": "low,normal,high,urgent",
  "hericilla_service_requests.service_type": "logistics,trucking,transportation,procurement,packing_removal,materials_support",
  "hericilla_service_requests.status": "new,quoted,approved,assigned,in_progress,completed,invoiced,closed,rejected,cancelled",
  "hericilla_stock_movements.movement_type": "received,issued,returned,transferred,written_off,damaged,missing",
  "hericilla_suppliers.category": "trucking,freight_forwarding,packing_materials,equipment_hire,fuel,security,shipping_agent,general_merchandise,other",
  "hericilla_tasks.priority": "low,normal,high,urgent",
  "hericilla_tasks.status": "open,in_progress,done,blocked",
  "hericilla_transport_jobs.status": "assigned,accepted,arrived,loaded,in_transit,delivered,verified,closed",
  "hericilla_trip_expenses.expense_type": "fuel,toll,maintenance,other",
  "hericilla_trip_expenses.status": "pending,approved,rejected",
  "hericilla_vehicle_movements.movement_type": "out_gate,in_gate,fuel_stop,site_stop",
  "hericilla_vehicles.status": "available,allocated,in_use,maintenance,retired",
  "hericilla_vehicles.vehicle_type": "flat_bed,low_bed,crane,forklift,truck,van,saloon",
  "hericilla_work_orders.service_type": "logistics,trucking,transportation,procurement,packing_removal,materials_support",
  "hericilla_work_orders.status": "open,in_progress,completed,closed",
};

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

/** `.from("table")` plus the filter chain that follows it (up to the next await/; boundary).
 *  Stops at the next `.from(` because sibling queries inside a Promise.all have no ";" between
 *  them, and bleeding past one applies another table's filters to the wrong enum domain. */
const FROM_RE = /\.from\(\s*["']([a-z0-9_]+)["']\)([\s\S]{0,700}?)(?:\.from\(\s*["']|[;]|\n\s*\}\s*\)|\n\s*return\b|$)/g;
const FILTER_RES = [
  { re: /\.eq\(\s*["']([a-z0-9_]+)["']\s*,\s*["']([^"']+)["']\s*\)/g, kind: "one" },
  { re: /\.neq\(\s*["']([a-z0-9_]+)["']\s*,\s*["']([^"']+)["']\s*\)/g, kind: "one" },
  { re: /\.in\(\s*["']([a-z0-9_]+)["']\s*,\s*\[([^\]]*)\]\s*\)/g, kind: "list" },
  { re: /\.not\(\s*["']([a-z0-9_]+)["']\s*,\s*["']in["']\s*,\s*["']\(?([^)"']+)\)?["']\s*\)/g, kind: "list" },
];

const problems = [];
const enumColsUsed = new Set();

for (const base of SCAN_DIRS) {
  for (const file of walk(join(ROOT, base))) {
    const text = readFileSync(file, "utf8");
    for (const [, table, chain] of text.matchAll(FROM_RE)) {
      if (!table.startsWith("hericilla_")) continue;
      for (const { re, kind } of FILTER_RES) {
        for (const m of chain.matchAll(re)) {
          const column = m[1];
          const raw = kind === "one" ? m[2] : m[2];
          const values = (kind === "one" ? [raw] : raw.split(",")).map((v) => v.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
          const key = `${table}.${column}`;
          const domain = ENUMS[key];
          if (!domain) continue;
          enumColsUsed.add(key);
          const legal = domain.split(",");
          for (const value of values) {
            if (!legal.includes(value)) {
              const line = text.slice(0, m.index + text.indexOf(chain)).split("\n").length;
              problems.push({ file: relative(ROOT, file), key, value, legal, hint: nearestLineHint(text, value) });
            }
          }
        }
      }
    }
  }
}

function nearestLineHint(text, value) {
  const i = text.indexOf(`"${value}"`);
  if (i === -1) return "";
  return text.slice(Math.max(0, text.lastIndexOf("\n", i) + 1), text.indexOf("\n", i)).trim();
}

if (problems.length === 0) {
  console.log(`check-enum-filters: OK — every enum filter matches its column domain (${enumColsUsed.size} enum columns exercised).`);
  process.exit(0);
}

console.error(`check-enum-filters: ${problems.length} enum filter value(s) do not exist in the column domain:\n`);
for (const p of problems) {
  console.error(`  ${p.file}\n    ${p.key} = "${p.value}" is not a valid hericilla enum label`);
  console.error(`    legal values: ${p.legal.join(", ")}`);
  if (p.hint) console.error(`    line: ${p.hint}`);
  console.error("");
}
console.error("PostgREST raises these as HTTP 400 / code 22P02, which most UIs swallow as an empty list.");
process.exit(1);
