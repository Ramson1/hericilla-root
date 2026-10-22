import type { ButtonHTMLAttributes, ReactNode } from "react";
import { statusLabel } from "@hericilla/types";

/* ---------------- Buttons (big, worded, high-contrast) ---------------- */

type BtnVariant = "primary" | "secondary" | "danger" | "success" | "ghost";

const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-400",
  secondary: "bg-white text-brand-800 border-2 border-brand-300 hover:bg-brand-50 focus-visible:ring-brand-400",
  danger: "bg-danger-600 text-white hover:bg-danger-800 focus-visible:ring-danger-600",
  success: "bg-success-600 text-white hover:bg-success-800 focus-visible:ring-success-600",
  ghost: "bg-transparent text-ink-soft hover:bg-brand-50 focus-visible:ring-brand-400",
};

export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  icon?: ReactNode;
  size?: "md" | "lg";
}

export function BigButton({
  variant = "primary",
  icon,
  size = "md",
  className = "",
  children,
  ...rest
}: BigButtonProps) {
  const sizing = size === "lg" ? "px-8 py-4 text-xl min-h-16" : "px-5 py-3 text-lg min-h-12";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-btn)] font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:opacity-50 disabled:cursor-not-allowed ${btnStyles[variant]} ${sizing} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------- Cards & layout ---------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--color-card)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] border border-[var(--color-line)] p-6 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  const tones = {
    brand: "bg-brand-100 text-brand-800",
    success: "bg-success-100 text-success-800",
    warning: "bg-warning-100 text-warning-800",
    danger: "bg-danger-100 text-danger-800",
  };
  return (
    <Card className="flex items-start gap-4">
      {icon && <div className={`rounded-2xl p-3 text-2xl ${tones[tone]}`}>{icon}</div>}
      <div>
        <div className="text-ink-soft text-base font-medium">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <div className="text-ink-soft text-sm mt-1">{hint}</div>}
      </div>
    </Card>
  );
}

export function PageHeader({
  title,
  purpose,
  actions,
}: {
  title: string;
  purpose: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-950">{title}</h1>
        <p className="text-ink-soft text-lg mt-1 max-w-2xl">{purpose}</p>
      </div>
      {actions && <div className="flex gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

export function HintCard({ steps }: { steps: [string, string, string] }) {
  return (
    <details className="bg-info-100 border-2 border-brand-200 rounded-[var(--radius-card)] p-4 mb-6 group" open>
      <summary className="cursor-pointer font-semibold text-info-800 text-lg select-none">
        What do I do here?
      </summary>
      <ol className="list-decimal list-inside mt-3 space-y-2 text-info-800">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

export function EmptyState({ title, teach, action }: { title: string; teach: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16 px-6 bg-white rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-line)]">
      <div className="text-5xl mb-3" aria-hidden>📭</div>
      <h3 className="text-xl font-bold text-brand-950">{title}</h3>
      <p className="text-ink-soft text-lg mt-2 max-w-md mx-auto">{teach}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- Status badges (words, not just colours) ---------------- */

const badgeTones: Record<string, string> = {
  approved: "bg-success-100 text-success-800",
  paid: "bg-success-100 text-success-800",
  completed: "bg-success-100 text-success-800",
  delivered: "bg-success-100 text-success-800",
  verified: "bg-success-100 text-success-800",
  closed: "bg-brand-100 text-brand-800",
  available: "bg-brand-100 text-brand-800",
  new: "bg-info-100 text-info-800",
  sent: "bg-info-100 text-info-800",
  pending: "bg-warning-100 text-warning-800",
  pending_approval: "bg-warning-100 text-warning-800",
  in_progress: "bg-warning-100 text-warning-800",
  overdue: "bg-danger-100 text-danger-800",
  rejected: "bg-danger-100 text-danger-800",
  failed: "bg-danger-100 text-danger-800",
  cancelled: "bg-danger-100 text-danger-800",
  retired: "bg-gray-200 text-gray-700",
  urgent: "bg-danger-100 text-danger-800",
  high: "bg-warning-100 text-warning-800",
  normal: "bg-brand-100 text-brand-800",
  low: "bg-gray-100 text-gray-700",
  feedback: "bg-success-100 text-success-800",
  complaint: "bg-danger-100 text-danger-800",
  issue: "bg-warning-100 text-warning-800",
  active: "bg-success-100 text-success-800",
  received: "bg-success-100 text-success-800",
  ordered: "bg-info-100 text-info-800",
  submitted: "bg-info-100 text-info-800",
  quoting: "bg-warning-100 text-warning-800",
  prospective: "bg-info-100 text-info-800",
  suspended: "bg-danger-100 text-danger-800",
  issued: "bg-warning-100 text-warning-800",
  expired: "bg-danger-100 text-danger-800",
  terminated: "bg-danger-100 text-danger-800",
  on_duty: "bg-info-100 text-info-800",
  clocked_out: "bg-success-100 text-success-800",
  absent: "bg-danger-100 text-danger-800",
  done: "bg-success-100 text-success-800",
  blocked: "bg-danger-100 text-danger-800",
  open: "bg-info-100 text-info-800",
  outside: "bg-warning-100 text-warning-800",
  // fleet
  allocated: "bg-info-100 text-info-800",
  in_use: "bg-warning-100 text-warning-800",
  maintenance: "bg-warning-100 text-warning-800",
  out_gate: "bg-info-100 text-info-800",
  in_gate: "bg-success-100 text-success-800",
  fuel_stop: "bg-warning-100 text-warning-800",
  site_stop: "bg-brand-100 text-brand-800",
  reviewing: "bg-warning-100 text-warning-800",
  resolved: "bg-success-100 text-success-800",
  accident: "bg-danger-100 text-danger-800",
  breakdown: "bg-danger-100 text-danger-800",
  near_miss: "bg-warning-100 text-warning-800",
  minor: "bg-warning-100 text-warning-800",
  moderate: "bg-warning-100 text-warning-800",
  severe: "bg-danger-100 text-danger-800",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = badgeTones[status] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-base font-semibold ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

/* ---------------- Skeleton loader ---------------- */

export function Skeleton({ className = "h-6" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />;
}
