"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BigButton } from "./primitives";

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white rounded-[var(--radius-card)] shadow-[var(--shadow-pop)] w-full ${wide ? "max-w-3xl" : "max-w-xl"} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-line)]">
          <h2 className="text-xl font-bold text-brand-950">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-xl font-bold text-ink-soft hover:text-brand-900 px-2"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- ConfirmDialog (typed-word confirm for destructive acts) ---------------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmWord,
  onConfirm,
  onCancel,
  danger = true,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmWord?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const ok = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase();
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="text-base mb-4">{message}</p>
      {confirmWord && (
        <p className="text-base mb-2">
          To confirm, type <strong>{confirmWord}</strong> below:
        </p>
      )}
      {confirmWord && (
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full rounded-xl border-2 border-[var(--color-line)] px-4 py-3 text-base mb-4"
          aria-label={`Type ${confirmWord} to confirm`}
        />
      )}
      <div className="flex gap-3 justify-end">
        <BigButton variant="secondary" onClick={onCancel}>
          No, go back
        </BigButton>
        <BigButton variant={danger ? "danger" : "primary"} disabled={!ok} onClick={onConfirm}>
          Yes, continue
        </BigButton>
      </div>
    </Modal>
  );
}

/* ---------------- Wizard (progress dots, max 5 steps, Back always visible) ---------------- */

export interface WizardStep {
  title: string;
  content: ReactNode;
  valid?: boolean; // when false, Next is disabled
}

export function Wizard({
  steps,
  onSubmit,
  submitLabel = "Finish",
  submitting,
}: {
  steps: WizardStep[];
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  return (
    <div>
      <ol className="flex items-center gap-2 mb-6" aria-label="Form progress">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-2">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-base ${
                i < index
                  ? "bg-success-600 text-white"
                  : i === index
                    ? "bg-brand-700 text-white"
                    : "bg-gray-200 text-gray-600"
              }`}
              aria-current={i === index ? "step" : undefined}
            >
              {i < index ? "✓" : i + 1}
            </span>
            {i < steps.length - 1 && <span className="hidden sm:block h-1 w-10 rounded bg-gray-200" />}
          </li>
        ))}
      </ol>
      <h3 className="text-lg font-bold mb-4 text-brand-950">
        Step {index + 1} of {steps.length}: {step.title}
      </h3>
      <div>{step.content}</div>
      <div className="flex justify-between gap-3 mt-8">
        <BigButton variant="secondary" onClick={() => setIndex((v) => Math.max(0, v - 1))} disabled={index === 0}>
          ← Back
        </BigButton>
        {last ? (
          <BigButton variant="success" onClick={onSubmit} disabled={submitting || step.valid === false} size="lg">
            {submitting ? "Saving…" : submitLabel}
          </BigButton>
        ) : (
          <BigButton onClick={() => setIndex((v) => v + 1)} disabled={step.valid === false}>
            Next →
          </BigButton>
        )}
      </div>
    </div>
  );
}

/* ---------------- DataTable-lite: rows as cards (mobile-friendly, elderly-readable) ---------------- */

export function RowCard({
  title,
  subtitle,
  badge,
  actions,
  onClick,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-white border border-[var(--color-line)] rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-sm ${onClick ? "cursor-pointer hover:border-brand-400" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className="flex-1 min-w-48">
        <div className="font-bold text-base text-brand-950">{title}</div>
        {subtitle && <div className="text-ink-soft text-base">{subtitle}</div>}
      </div>
      {badge}
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
