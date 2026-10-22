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

| Role (`profiles.role`)        | Website | Admin portal | Staff portal | Driver app |
|-------------------------------|---------|--------------|--------------|------------|
| super_admin, admin            | yes     | yes          | —            | —          |
| supervisor                    | yes     | yes          | yes          | —          |
| procurement/finance/logistics officer, hr_officer, auditor | yes | yes (scoped) | yes | — |
| warehouse_agent, staff        | yes     | —            | yes          | —          |
| driver                        | yes     | —            | —            | yes        |

RBAC helpers in SQL: `auth.current_role()`, `auth.has_role(VARIADIC text[])`. All tables are deny-by-default (RLS enabled, no policy = no access). Full policy matrix lives in `supabase/migrations/0017_audit_rls.sql`.

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

`enquiries`/`service_requests` → `quotations` → **`work_orders` (`wo_number`)** → typed jobs (`transport_jobs`, `packing_jobs`, `purchase_requests`) → `job_status_history`, `proof_of_delivery`, `attendance_events`, `documents`, `trip_expenses` → `invoices` → `payments`. `payroll_runs`/`payslips` consume approved `attendance_daily` + `attendance_rules`. `vehicle_allocations` + append-only `vehicle_movements` track fleet.

## Notification flow

1. Any producer (trigger, Edge Function, UI action) inserts a row into `notification_outbox` (recipient or role target, channel list, payload).
2. `notify` Edge Function runs on interval (pg_cron → `net.http_postfix` or supabase scheduler), claims due rows, fans out to:
   - Expo push service (`exp.host/--/api/v2/push/send`) using `expo_push_tokens`;
   - Web Push (`web-push` Deno port + VAPID) using `web_push_subscriptions`;
   - Resend email for critical events and as universal fallback;
   - In-app bell rows (same table, read state via `notifications_seen`).
3. Failures retry with exponential backoff (`attempt_count`, `next_retry_at`).

## Storage buckets

`public-assets` (website/blog/testimonial images) · `enquiry-uploads` (visitor documents) · `documents` (contracts, permits — private) · `pod-evidence` (delivery photos/signatures) · `receipts` (expense photos). Private buckets use signed URLs gated by RLS.

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
