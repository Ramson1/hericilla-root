"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

/* ---------------- Elderly-first form fields ----------------
   One label per field, inline error text in words, oversized inputs. */

function FieldShell({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block mb-5">
      <span className="block font-semibold text-lg text-brand-950 mb-1">
        {label}
        {required && <span className="text-danger-600 ml-1" aria-hidden>*</span>}
      </span>
      {hint && <span className="block text-ink-soft text-base mb-2">{hint}</span>}
      {children}
      {error && (
        <span className="block mt-2 text-danger-600 font-semibold text-base" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border-2 border-[var(--color-line)] bg-white px-4 py-3 text-lg min-h-12 " +
  "focus:outline-none focus:ring-4 focus:ring-brand-200 focus:border-brand-500 placeholder:text-gray-400";

export interface BigInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function BigInput({ label, hint, error, required, ...rest }: BigInputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <input className={inputClass} required={required} {...rest} />
    </FieldShell>
  );
}

export interface BigPasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
  error?: string;
}

export function BigPasswordInput({ label, hint, error, required, ...rest }: BigPasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          className={`${inputClass} pr-14`}
          required={required}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </div>
    </FieldShell>
  );
}

export interface BigTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function BigTextarea({ label, hint, error, required, ...rest }: BigTextareaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <textarea className={`${inputClass} min-h-28`} required={required} {...rest} />
    </FieldShell>
  );
}

export interface BigSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function BigSelect({ label, hint, error, required, options, ...rest }: BigSelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      <select className={inputClass} required={required} {...rest}>
        <option value="">— Please choose —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function BigCheckbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 mb-5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-6 w-6 accent-[var(--color-brand-700)]"
      />
      <span>
        <span className="block font-semibold text-lg">{label}</span>
        {hint && <span className="block text-ink-soft text-base">{hint}</span>}
      </span>
    </label>
  );
}
