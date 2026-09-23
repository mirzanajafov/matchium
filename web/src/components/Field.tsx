import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
}

export function Field({ label, name, ...input }: FieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        className="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        {...input}
      />
    </label>
  );
}
