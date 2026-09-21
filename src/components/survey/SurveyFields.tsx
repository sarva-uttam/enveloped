import { useId } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  required?: boolean;
}

export function Field({ label, value, onChange, placeholder, type = "text", error, required }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <label className="block" htmlFor={id}>
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "focus-ring mt-1.5 w-full rounded-sm border bg-paper-raised px-4 py-3 text-sm outline-none transition",
          error ? "border-burgundy" : "border-line focus:border-ink",
        )}
      />
      {error && (
        <span id={errorId} role="alert" className="mt-1.5 block text-xs text-burgundy">
          {error}
        </span>
      )}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <label className="block" htmlFor={id}>
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="focus-ring mt-1.5 w-full rounded-sm border border-line bg-paper-raised px-4 py-3 text-sm outline-none transition focus:border-ink"
      />
    </label>
  );
}

export function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/70 py-2 text-sm last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium text-ink">{value || "—"}</span>
    </div>
  );
}
