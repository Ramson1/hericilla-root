# Hericilla — User Acceptance Testing Checklist

A printable, plain-English test script for go-live sign-off. Each line is one action
followed by what you should see. Work top to bottom per section; tick the box when the
result matches. Target: at least 2–3 real users from the office (including one elderly
user) run the **Admin** and **Staff** sections in person; a driver runs the **Driver**
section on their own Android phone.

Conventions used below:
- **Admin URL** = the admin portal (port 3001 in testing), **Staff URL** = staff portal (3002),
  **Driver app** = the installed Expo/APK build.
- Sign-in emails/passwords come from *Settings → Users & Invites* (temporary password shown once).
- "Expected" = what the screen must show. If anything differs, note the page name and what
  you saw, then report it to the system builder.

---

## 0. Preparation (builder / super admin)

- [ ] Run all migrations `0001`–`0025` on the staging Supabase project.
- [ ] Deploy edge functions: `notify`, `enquiry-intake`, `career-apply`, `attendance-geofence`, `pdf-export`, `admin-invite`.
- [ ] Set secrets: `SUPABASE_SERVICE_ROLE_KEY`, Resend API key + sender domain, VAPID keys, Expo push credentials.
- [ ] Seed one of each: client, supplier, department, site (with GPS + radius), shift, active driver with licence, one vehicle, one inventory item below minimum.
- [ ] Invite test users: 1 admin, 1 supervisor, 1 finance officer, 1 procurement officer, 1 warehouse agent, 1 hr officer, 1 staff, 1 driver, 1 auditor.

---

## 1. Public website

- [ ] Open Home → hero advertises the 6 service lines; logo, phone numbers and Abuloma addresses visible.
- [ ] Tap a phone number on a mobile → dialer opens.
- [ ] Services → open each of the 6 detail pages → each has plain-English copy and a "Request a Quote" button.
- [ ] Blog list → open an article → text readable at 18px+, share buttons present.
- [ ] Testimonials page shows approved quotes only (unapproved ones from CMS are hidden).
- [ ] Careers → apply to a job with a CV file → confirmation shown; Admin → CMS → Careers shows the application.
- [ ] **Request a Quotation** (multi-step): fill service type → cargo → dates → upload a document → review → submit.
  - [ ] Success page shows an `ENQ-YYYY-####` reference.
  - [ ] Check "Enquiry status" page with that reference → shows current status.
  - [ ] Within minutes: Admin → Inbox → Enquiries shows the new row; admin email arrives.
- [ ] Chat widget: open as visitor, send a message → stays in Admin Inbox → chat with a real reply appearing live (Realtime).
- [ ] With no agent online, the widget offers to convert the chat into an enquiry form → conversion produces an ENQ reference.
- [ ] Privacy page mentions GPS collection for attendance and why.

## 2. Admin — sign-in & shell

- [ ] Sign in at Admin URL with the admin test user → dashboard loads, KPI cards show numbers (not errors).
- [ ] Sign in with the **driver** user at Admin URL → access is refused with a plain-English reason.
- [ ] Seven big nav items visible; search box ("Find anything") finds e.g. "vehicles" and jumps there.
- [ ] Every page has a title + one-line purpose; hint card appears first visit, stays dismissed after closing.
- [ ] Bell icon shows unseen count; opening notifications marks them read.
- [ ] First login prompts for push-notification permission → accept → a test announcement (section 12) arrives as a desktop notification.

## 3. Admin — clients, service requests, quotations, work orders

- [ ] Clients → add a client with RC number and address → appears in list; open detail → contacts/contracts tabs work.
- [ ] Jobs → **+ New Service Request** wizard, 5 steps max, Back always visible → submit → ref `SR-YYYY-####` shown.
- [ ] SR detail → build quotation with 2 line items → save → approve quotation.
- [ ] Approval generates a work order `WO-YYYY-####` automatically (visible on SR page and Work Orders list).
- [ ] Log feedback against the SR (complaint + compliment) → appears in SR timeline.
- [ ] Change SR status through lifecycle → buttons only offer legal next steps.

## 4. Admin — procurement

- [ ] Create a Purchase Request under a work order → route for approval.
- [ ] Record two supplier quotations → comparison screen highlights the cheaper total.
- [ ] Select a quotation → create PO → PO shows margin-relevant totals.
- [ ] Approve a PR **above** the creator's `approval_limits` while signed in as procurement officer → blocked / routed upward; approve as admin → allowed.
- [ ] Goods Received Note against the PO → stock received appears in Inventory if items link to inventory.
- [ ] Supplier list → performance score updates after GRN.

## 5. Admin — packing, inventory, documents

- [ ] Create a packing job wizard → assign team + vehicle → stage tracker advances packing → loaded → transit → unloading → completed.
- [ ] Item list with box numbers and conditions survives reload; handover record can be added.
- [ ] Inventory → receive 10 units, issue 4 to a work order → `stock_levels` shows 6; item below minimum flags a reorder alert.
- [ ] Reorder alert arrives in admin bell (outbox consumed).
- [ ] Documents → upload a contract PDF linked to the client → expiry date set 20 days ahead → reminder appears (see section 13).
- [ ] Non-finance role (e.g. warehouse agent) opening Money → sees nothing they shouldn't (RLS).

## 6. Admin & Staff — attendance

- [ ] Build a shift (start/end/break) in Attendance → assign a staff member for tomorrow.
- [ ] Staff portal → Clock In with location allowed → verdict **verified** (inside geofence) shows immediately.
- [ ] Clock In with mocked location far outside → verdict **outside**; supervisor sees the flag.
- [ ] Clock Out → timesheet shows hours; forgetting to clock out produces a missed-clock-out exception for the supervisor.
- [ ] Raise a correction request with a reason → supervisor approves → paired event written, **audit log entry created** (Settings → Audit Log).
- [ ] Two overlapping clock-ins for one person on one day → second is rejected with a clear message.
- [ ] Leave request → submit → supervisor approves → appears on the person's calendar.

## 7. Admin — fleet & vehicles

- [ ] Register a vehicle (type, capacity, insurance + inspection expiry dates) → appears on the status board.
- [ ] Allocate vehicle → driver → work order; conflicting allocation for the same window is blocked.
- [ ] Record gate-out movement with odometer → board's "last movement" updates.
- [ ] Schedule maintenance → mark done with cost → fuel-vs-odometer per km report computes.
- [ ] Driver submits a pre-trip inspection with one FAULT → fault appears in admin inspections feed and can open a maintenance job.
- [ ] Report an incident from the driver app → Admin → Vehicles → Incidents → review → resolve with note.

## 8. Driver app (Android device, real)

- [ ] Install APK → sign in with driver account → Home shows today's trips and assigned vehicle reg number.
- [ ] Sign in with a **staff** (non-driver) account → locked screen with reason and hold-to-call Operations works (dialer opens +234 803 403 6596).
- [ ] Job → Accept → Arrived → Loaded → In transit → Delivered; each tap records history (visible in Admin job tracker with GPS + time).
- [ ] "Open in Maps" launches the phone's map app to the pickup address.
- [ ] On Delivered, the POD screen opens: take 2 photos (they compress), sign with finger, choose outcome **Delivered**, submit.
- [ ] Admin → Deliveries → the POD appears → verify photos + signature load → Verify → job status becomes **verified**.
- [ ] POD with outcome **Damaged** is highlighted red for attention before verification.
- [ ] Trip expense: enter fuel amount + receipt photo → Admin → Deliveries → Expenses → approve; driver's **own** expense cannot be approved by themselves in admin UI (button disabled with explanation).
- [ ] **Offline test**: enable airplane mode → accept job, clock in, capture POD → banner "Waiting to sync: n" → restore data → items sync within a minute and appear server-side exactly once (re-run sync = no duplicates).
- [ ] Clock In/Out with GPS works; missed event → correction request form submits.
- [ ] Push: assign a new job from admin → phone notification → tapping opens that job.

## 9. Admin & Finance — money

- [ ] Create invoice from an approved quotation → status Draft → Send → status Sent with due date.
- [ ] Record a part-payment → status becomes Partial; outstanding = total − paid (check Receivables report).
- [ ] Backdate an invoice's due date 40 days → ageing report shows it under "31–60 days late".
- [ ] Adjustment to an invoice → append-only, original untouched, audit entry written.
- [ ] Approve operational expense → appears in that work order's cost → margin report updates.

## 10. Admin — payroll & salary allocator

- [ ] Salary structure for a driver: base + allowance − deduction → effective today.
- [ ] Payroll run wizard → pick month → pulls **approved attendance only** → overtime calculated per active `attendance_rules` (grace, multiplier, weekly cap).
- [ ] Draft payslip shows gross/overtime/deductions/net → adjust one with a reason → audit entry.
- [ ] Submit run for approval → approve as finance officer → payslips locked.
- [ ] **Approver ≠ recipient**: signed-in as the person being paid → approve button unavailable.
- [ ] Mark payslip paid (method + reference) → payment tracking report shows paid vs pending.
- [ ] Download a payslip PDF from pdf-export → name, period, net amount correct.

## 11. Admin — reports & exports

- [ ] Reports page: all 8 tiles load with data (no error spinners) after the flows above.
- [ ] Job margins: revenue − cost = margin for one known work order (spot-check arithmetic).
- [ ] Receivables pie chart matches table totals.
- [ ] Attendance monthly report: pick this month → hours match the timesheets you tested.
- [ ] Export any two reports to CSV → open in Excel → headers and money values correct, status columns in plain words.

## 12. Admin — settings, permissions & audit

- [ ] Settings → Users & Invites → invite a new staff user → temporary password shown once → new user can sign in at Staff portal.
- [ ] Change a user's role + department → save succeeds for admin, and the driver user now logs into the staff portal instead of the driver app.
- [ ] Permission matrix: set warehouse_agent can_approve = off on Purchase Requests → that role's approve button disappears in the UI.
- [ ] Approval limits: lower a role's limit → next PR above it requires a higher approver.
- [ ] Attendance rules: change grace to 5 → next late clock-in uses 5 minutes.
- [ ] App settings: edit `expiry_reminder_days` to 60 → value persists after reload.
- [ ] Audit Log: filter by entity, export CSV → contains the correction, payroll, invoice and permission changes from sections 6–12, with who + when.
- [ ] Auditor role user can see Audit Log but not edit any settings (controls hidden/denied).

## 13. Notifications & reminders

- [ ] Run `select public.check_document_expiry(), public.notify_upcoming_expiries();` (or wait for the 07:00 UTC cron) → documents/vehicles/licences expiring within the reminder window generate bell items for admin/logistics/HR and an email.
- [ ] Same reminder does **not** fire twice for the same expiry date (dedup table).
- [ ] Enquiry + chat offline + attendance exceptions + payroll approval each reach the right roles with sensible wording.
- [ ] Web push delivered while browser open; in-app bell + email still arrive with push disabled (fallback).

## 14. Accessibility & elderly-UX walkthrough (do with real users)

- [ ] Text base size ≥ 18px everywhere on admin/staff; primary buttons ≥ 48px, driver app ≥ 64px.
- [ ] All status badges readable as words ("Waiting for approval", not amber dots alone).
- [ ] Destructive actions ask for typed confirmation and where possible offer Undo.
- [ ] Empty states teach what happens next (visit a fresh module with no data).
- [ ] Reduced-motion OS setting → no animated surprises.
- [ ] Keyboard-only navigation reaches every primary action; focus rings visible.
- [ ] Print the quick-reference guide for drivers and hand it to one real driver — they can follow it.

## 15. Sign-off

| Role | Name | Date | Result (Pass / Pass-with-notes / Fail) | Notes |
|---|---|---|---|---|
| Managing admin | | | | |
| Finance officer | | | | |
| Procurement officer | | | | |
| Supervisor (attendance) | | | | |
| Fleet/logistics officer | | | | |
| Warehouse agent | | | | |
| Driver (device test) | | | | |
| Elderly-user UX observer | | | | |

**Go-live gate:** every Fail resolved; every Pass-with-notes accepted in writing by the
managing admin before migration to the production Supabase project.
