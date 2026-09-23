import { percent } from "@/lib/format";

interface MeterProps {
  value: number;
  label: string;
  caption?: string;
}

export function Meter({ value, label, caption }: MeterProps) {
  const pct = percent(value);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-medium tabular-nums">{pct}%</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {caption && <p className="mt-2 text-sm text-muted">{caption}</p>}
    </div>
  );
}
