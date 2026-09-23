"use client";

interface ScaleProps {
  name: string;
  label: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (value: number) => void;
}

const POINTS = [1, 2, 3, 4, 5];

export function Scale({ name, label, low, high, value, onChange }: ScaleProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 grid grid-cols-5 gap-2" role="radiogroup" aria-label={label}>
        {POINTS.map((point) => {
          const selected = value === point;
          return (
            <label
              key={point}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                selected
                  ? "border-accent bg-accent text-white dark:text-background"
                  : "border-line bg-surface hover:border-accent"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={point}
                checked={selected}
                onChange={() => onChange(point)}
                className="sr-only"
              />
              {point}
            </label>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}
