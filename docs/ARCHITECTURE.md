# Hericilla Ecosystem — Architecture

Four apps, one Supabase backend. See `docs/requirements/` for the source specifications.

```
website (public)  ─┐
admin  (ops)       ├─►  Supabase: Postgres + Auth (RLS) + Storage + Realtime + Edge Functions
staff-portal       │       ▲
driver-app (Expo) ─┘       │
                    notify (outbox fan-out: Expo push · Web Push · Resend email)
```

## App gating by role

| Role (`hericilla_profiles.role`) | Website | Admin portal | Staff portal | Driver app |
|-------------------------------|---------|--------------|--------------|------------|
| super_admin, admin            | yes     | yes          | —            | —          |
| supervisor                    | yes     | yes          | yes          | —          |
| procurement/finance/logistics officer, hr_officer, auditor | yes | yes (scoped) | yes | — |
| warehouse_agent, staff        | yes     | —            | yes          | —          |
| driver                        | yes     | —            | —            | yes        |

RBAC helpers in SQL: `public.hericilla_is_ops()`, `public.hericilla_is_admin()`, `public.hericilla_is_driver()`, `public.hericilla_has_role(...)`. All tables are deny-by-default (RLS enabled, no policy = no access). Full policy matrix lives in `supabase/migrations/0018_audit_rls.sql`, with later gaps closed in 0022 and 0024.

### Object naming — `hericilla_` prefix

This Supabase account hosts other projects, so every object we create carries the company name. Tables,
views, enum types and functions all live in the shared `public` schema and take the underscore prefix:
`hericilla_clients`, `hericilla_work_orders`, `hericilla_pipeline`, `hericilla_job_status`,
`hericilla_is_ops`. Storage buckets take the hyphen form used by their ids: `hericilla-documents`,
`hericilla-pod-evidence`. The four frontends (website, admin portal, staff portal, driver app) and the
Edge Functions all talk to that one schema, so the prefix is what identifies Hericilla objects wherever
they are seen — including in the dashboard's Tables, Types, Functions and Storage sections.

Run `pnpm check:schema` after touching migrations or queries. It fails on an unprefixed object, on a
reference to one that does not exist, and on the stranding positions a rename misses by eye: policies
that qualify their protected table (`` `<table>.id` ``), `` `<name>%rowtype` `` attributes, declare-block
row variables (`` `<var> <table>;` ``), column and parameter definitions that name an enum type, function
calls with no schema qualifier, `.rpc("…")`, embedded relations without an alias, `headCount("…")` and
bucket ids that drifted from the canonical spelling. `scripts/rename-tables.mjs` performs the same
renames in every one of those positions; it is idempotent, so a dry run reporting zero changes is the
proof that a tree is fully moved.

Embedded relations keep their old JSON keys through aliases:
`.select("*, clients:hericilla_clients(name)")`.

## Admin portal navigation (elderly-first, 7 items)

Primary nav groups the spec's 14 sections:

| Nav item   | Contains |
|------------|----------|
| Dashboard  | KPI cards, "Needs your attention" queue |
| Jobs       | Service Requests · Logistics & Transportation · Procurement · Packing & Removal |
| People     | Clients · Suppliers · Staff Management · Attendance & Shifts · Salary (Payroll) |
| Vehicles   | Vehicles Movement & Allocation · Inventory & Materials |
| Money      | Finance & Billing · Contracts & Documents · Reports & Analytics |
| Inbox      | Enquiries · Live Chat · Announcements |
| More       | Website CMS (Blog, Testimonials, Careers, Pages) · Settings & Permissions |

Every page: title + one-line plain-English purpose + collapsible 3-step "What do I do here?" hint.

## Data model spine

`hericilla_enquiries`/`hericilla_service_requests` → `hericilla_quotations` → **`hericilla_work_orders` (`wo_number`)** → typed jobs (`hericilla_transport_jobs`, `hericilla_packing_jobs`, `hericilla_purchase_requests`) → `hericilla_job_status_history`, `hericilla_proof_of_delivery`, `hericilla_attendance_events`, `hericilla_documents`, `hericilla_trip_expenses` → `hericilla_invoices` → payments. `hericilla_payroll_runs`/`hericilla_payslips` consume approved `hericilla_attendance_daily` + `hericilla_attendance_rules`. `hericilla_vehicle_allocations` + append-only `hericilla_vehicle_movements` track fleet.

## Notification flow

1. Any producer (trigger, Edge Function, UI action) inserts a row into `hericilla_notification_outbox` (recipient or role target, channel list, payload).
2. `notify` Edge Function runs on interval (pg_cron → `net.http_postfix` or supabase scheduler), claims due rows, fans out to:
   - Expo push service (`exp.host/--/api/v2/push/send`) using `hericilla_expo_push_tokens`;
   - Web Push (`web-push` Deno port + VAPID) using `hericilla_web_push_subscriptions`;
   - Resend email for critical events and as universal fallback;
   - In-app bell rows (same table, read state via `hericilla_notifications_seen`).
3. Failures retry with exponential backoff (`attempt_count`, `next_retry_at`).

## Storage buckets

`hericilla-public-assets` (website/blog/testimonial images) · `hericilla-enquiry-uploads` (visitor documents) · `hericilla-documents` (contracts, permits — private) · `hericilla-pod-evidence` (delivery photos/signatures) · `hericilla-receipts` (expense photos). Private buckets use signed URLs gated by RLS. Bucket ids are prefixed with `hericilla-` because the id is what the dashboard and `storage.objects` rows show; `hericilla_documents` with an underscore is the documents *table*, and the schema guard keeps the two apart.

## Offline strategy (driver app)

All driver writes land first in a local SQLite outbox (`expo-sqlite`) with client-generated UUID `event_id`, `original_event_time`, photo files queued in app storage. A background sync loop (NetInfo-triggered + app focus) POSTs rows to Supabase; the server rejects duplicate `event_id`s (dedupe) and never rewrites existing rows. Synced rows record `synced_at`. POD photo uploads compress client-side (≈300KB JPEG) and resume when connectivity returns.

## Environment variables (each app, `.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=        # admin + staff portal web push
EXPO_PUBLIC_SUPABASE_URL=            # driver app
EXPO_PUBLIC_SUPABASE_ANON_KEY=
# Edge Function secrets (set via supabase secrets): RESEND_API_KEY, VAPID_PRIVATE_KEY,
# VAPID_PUBLIC_KEY, VAPID_SUBJECT
```
