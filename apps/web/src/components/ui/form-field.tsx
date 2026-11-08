import type { ReactNode } from "react";

/** Standard form row: label above the control, optional hint below. Wrapping label keeps the control accessible without ids. */
export function FormField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span className="flab">{label}{required && <span className="req" aria-hidden="true"> *</span>}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
