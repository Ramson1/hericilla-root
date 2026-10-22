/**
 * Shared enums & domain types for the Hericilla ecosystem.
 * Must stay in sync with supabase/migrations (Postgres enums).
 * After connecting a live project, run `pnpm gen:types` for generated row types.
 */

export const APP_ROLES = [
  "super_admin",
  "admin",
  "supervisor",
  "procurement_officer",
  "finance_officer",
  "logistics_officer",
  "warehouse_agent",
  "hr_officer",
  "staff",
  "driver",
  "auditor",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ADMIN_ROLES: AppRole[] = [
  "super_admin", "admin", "supervisor", "procurement_officer",
  "finance_officer", "logistics_officer", "hr_officer", "auditor",
];
export const STAFF_ROLES: AppRole[] = [
  "supervisor", "procurement_officer", "finance_officer", "logistics_officer",
  "warehouse_agent", "hr_officer", "staff",
];

export const SERVICE_TYPES = [
  "logistics", "trucking", "transportation", "procurement",
  "packing_removal", "materials_support",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  logistics: "Logistics",
  trucking: "Trucking",
  transportation: "Transportation",
  procurement: "Procurement & contracts",
  packing_removal: "Packing & removal",
  materials_support: "Materials support",
};

export const SERVICE_REQUEST_STATUSES = [
  "new", "quoted", "approved", "assigned", "in_progress",
  "completed", "invoiced", "closed", "rejected", "cancelled",
] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const TRANSPORT_JOB_STATUSES = [
  "assigned", "accepted", "arrived", "loaded", "in_transit",
  "delivered", "verified", "closed",
] as const;
export type TransportJobStatus = (typeof TRANSPORT_JOB_STATUSES)[number];

export const PACKING_JOB_STAGES = [
  "packing", "loaded", "transit", "unloading", "completed",
] as const;
export type PackingJobStage = (typeof PACKING_JOB_STAGES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DOC_TYPES = [
  "contract", "quotation", "invoice", "purchase_order", "receipt", "permit",
  "insurance", "licence", "waybill", "delivery_note", "pod", "completion_report",
  "certificate", "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const INVOICE_STATUSES = ["draft", "sent", "paid", "partial", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const STOCK_MOVEMENT_TYPES = [
  "received", "issued", "returned", "transferred", "written_off", "damaged", "missing",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const ATTENDANCE_EVENT_TYPES = ["clock_in", "clock_out", "break_start", "break_end"] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export const GEOFENCE_RESULTS = ["verified", "outside", "unchecked"] as const;
export type GeofenceResult = (typeof GEOFENCE_RESULTS)[number];

export const EVENT_SOURCES = ["web", "app", "offline_sync", "admin", "correction"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const PAYROLL_RUN_STATUSES = ["draft", "pending_approval", "approved", "paid", "rejected"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const VEHICLE_TYPES = ["flat_bed", "low_bed", "crane", "forklift", "truck", "van", "saloon"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_STATUSES = ["available", "allocated", "in_use", "maintenance", "retired"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const MOVEMENT_TYPES = ["out_gate", "in_gate", "fuel_stop", "site_stop"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const POD_OUTCOMES = ["delivered", "rejected", "damaged", "missing", "partial"] as const;
export type PodOutcome = (typeof POD_OUTCOMES)[number];

export const INCIDENT_TYPES = ["accident", "breakdown", "near_miss", "safety", "other"] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_SEVERITIES = ["minor", "moderate", "severe"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = ["open", "reviewing", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const TRIP_PHASES = ["pre", "post"] as const;
export type TripPhase = (typeof TRIP_PHASES)[number];

/* ---------- Payroll ---------- */

export interface SalaryAllowance { name: string; amount: number }
export interface SalaryDeduction { name: string; amount?: number | null; percent?: number | null }
export type PayCycle = "monthly";

export const PR_STATUSES = [
  "draft", "submitted", "quoting", "pending_approval", "approved",
  "rejected", "ordered", "received", "closed",
] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const PO_STATUSES = ["draft", "sent", "partial", "received", "closed", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const SUPPLIER_CATEGORIES = [
  "trucking", "freight_forwarding", "packing_materials", "equipment_hire",
  "fuel", "security", "shipping_agent", "general_merchandise", "other",
] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export const SUPPLIER_STATUSES = ["approved", "prospective", "suspended"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const SUPPLIER_CATEGORY_LABELS: Record<SupplierCategory, string> = {
  trucking: "Trucking", freight_forwarding: "Freight forwarding", packing_materials: "Packing materials",
  equipment_hire: "Equipment hire", fuel: "Fuel", security: "Security", shipping_agent: "Shipping agent",
  general_merchandise: "General merchandise", other: "Other",
};

export const EXPENSE_TYPES = ["fuel", "toll", "maintenance", "other"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["expo_push", "web_push", "email", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const ENQUIRY_STATUSES = ["new", "assigned", "in_progress", "responded", "closed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const LEAVE_TYPES = ["annual", "sick", "unpaid", "compassionate", "maternity"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const TASK_STATUSES = ["open", "in_progress", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/* ---------- Display helpers (words, not colours — elderly-first) ---------- */

export const STATUS_LABELS: Record<string, string> = {
  new: "New", quoted: "Quoted", approved: "Approved", assigned: "Assigned",
  in_progress: "In progress", completed: "Completed", invoiced: "Invoiced",
  closed: "Closed", rejected: "Rejected", cancelled: "Cancelled",
  accepted: "Accepted", arrived: "Arrived", loaded: "Loaded",
  in_transit: "In transit", delivered: "Delivered", verified: "Verified",
  draft: "Draft", sent: "Sent", paid: "Paid", partial: "Partly paid",
  overdue: "Overdue", pending: "Waiting for approval", void: "Voided",
  available: "Available", maintenance: "At maintenance", retired: "Retired",
  in_use: "In use", packing: "Packing", transit: "On the way",
  unloading: "Unloading", pending_approval: "Waiting for approval",
  submitted: "Submitted", quoting: "Getting quotes", ordered: "Ordered",
  received: "Received", issued: "Issued out", returned: "Returned",
  transferred: "Transferred", written_off: "Written off", damaged: "Damaged",
  missing: "Missing", expired: "Expired", archived: "Archived", active: "Active",
  terminated: "Terminated", prospective: "Prospective", suspended: "Suspended",
  shortlisted: "Shortlisted", hired: "Hired", reviewed: "Reviewed",
  on_duty: "On duty now", clocked_out: "Finished for the day", absent: "Not clocked in",
  clock_in: "Clocked in", clock_out: "Clocked out", break_start: "Break started",
  break_end: "Break ended", verified_in: "Location verified", outside: "Outside site",
  unchecked: "Location unchecked", done: "Done", blocked: "Blocked", open: "Open",
  annual: "Annual", sick: "Sick", unpaid: "Unpaid", compassionate: "Compassionate",
  maternity: "Maternity", missed_clock_in: "Missed clock-in", missed_clock_out: "Missed clock-out",
  wrong_time: "Wrong time recorded",
  super_admin: "Super Admin", admin: "Admin", supervisor: "Supervisor",
  procurement_officer: "Procurement Officer", finance_officer: "Finance Officer",
  logistics_officer: "Logistics Officer", warehouse_agent: "Warehouse Agent",
  hr_officer: "HR Officer", staff: "Staff", driver: "Driver", auditor: "Auditor",
  // fleet
  allocated: "Given to a job", out_gate: "Left the yard", in_gate: "Back in the yard",
  fuel_stop: "Fuel stop", site_stop: "Stopped at site",
  flat_bed: "Flat bed", low_bed: "Low bed", crane: "Crane", forklift: "Forklift",
  truck: "Truck", van: "Van", saloon: "Saloon car",
  accident: "Accident", breakdown: "Breakdown", near_miss: "Near miss", safety: "Safety issue",
  reviewing: "Being looked at", resolved: "Resolved", minor: "Minor", moderate: "Moderate",
  severe: "Severe", on_hold: "On hold",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

/* ---------- Core row interfaces (subset used across apps) ---------- */

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: AppRole;
  department_id?: string | null;
  employee_no?: string | null;
  avatar_url?: string | null;
  home_base?: string | null;
  status: "active" | "inactive";
  license_number?: string | null;
  license_expiry?: string | null;
  employed_at?: string | null;
}

export interface Client {
  id: string;
  name: string;
  rc_number?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_terms?: string | null;
  created_at: string;
}

export interface ServiceRequest {
  id: string;
  ref_no: string;
  client_id?: string | null;
  enquiry_id?: string | null;
  service_type: ServiceType;
  title: string;
  description?: string | null;
  priority: Priority;
  deadline?: string | null;
  status: ServiceRequestStatus;
  assigned_department_id?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface WorkOrder {
  id: string;
  wo_number: string;
  service_request_id?: string | null;
  client_id?: string | null;
  service_type: ServiceType;
  status: "open" | "in_progress" | "completed" | "closed";
  started_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface TransportJob {
  id: string;
  work_order_id: string;
  pickup_location: string;
  destination: string;
  delivery_instructions?: string | null;
  scheduled_at?: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  team_lead_id?: string | null;
  status: TransportJobStatus;
  created_at: string;
}

export interface Vehicle {
  id: string;
  reg_no: string;
  make?: string | null;
  model?: string | null;
  vehicle_type: VehicleType;
  capacity?: string | null;
  status: VehicleStatus;
  insurance_expiry?: string | null;
  inspection_expiry?: string | null;
  odometer_km?: number | null;
}

export interface Enquiry {
  id: string;
  ref_no: string;
  enquiry_type: "quotation" | "service_enquiry" | "general";
  service_type?: ServiceType | null;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  message: string;
  documents?: string[] | null;
  status: EnquiryStatus;
  assigned_to?: string | null;
  created_at: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  content_md: string;
  cover_image?: string | null;
  category: "blog" | "news" | "project_update";
  tags?: string[] | null;
  status: "draft" | "scheduled" | "published" | "archived";
  published_at?: string | null;
  author_id?: string | null;
}

export interface Career {
  id: string;
  title: string;
  department?: string | null;
  location?: string | null;
  description?: string | null;
  requirements?: string | null;
  closing_date?: string | null;
  status: "open" | "closed";
  created_at: string;
}

export interface Testimonial {
  id: string;
  client_name: string;
  company?: string | null;
  photo_url?: string | null;
  quote: string;
  rating?: number | null;
  approved: boolean;
  display_order?: number | null;
}

export interface AttendanceEvent {
  id: string;
  event_id: string;
  employee_id: string;
  event_type: AttendanceEventType;
  work_order_id?: string | null;
  site_id?: string | null;
  event_time: string;
  gps_lat?: number | null;
  gps_lng?: number | null;
  geofence_result: GeofenceResult;
  source: EventSource;
  original_event_time?: string | null;
  synced_at?: string | null;
}

export interface PayrollRun {
  id: string;
  period_month: string;
  status: PayrollRunStatus;
  generated_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  notes?: string | null;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  status: "queued" | "sent" | "failed" | "retrying";
  created_at: string;
}
