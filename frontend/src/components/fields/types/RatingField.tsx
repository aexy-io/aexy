"use client";

import { FieldViewProps, FieldEditProps } from "../types";

function Stars({ count, max, icon }: { count: number; max: number; icon: string }) {
  const filled = icon === "heart" ? "\u2665" : "\u2605";
  const empty = icon === "heart" ? "\u2661" : "\u2606";
  return (
    <span className="text-yellow-400 text-sm tracking-wide">
      {filled.repeat(Math.min(count, max))}
      {empty.repeat(Math.max(max - count, 0))}
    </span>
  );
}

export function RatingFieldView({ value, config, surface }: FieldViewProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const num = typeof value === "number" ? value : parseInt(String(value), 10) || 0;
  const max = config.max_rating || 5;
  const icon = config.rating_icon || "star";
  return <Stars count={num} max={max} icon={icon} />;
}

export function RatingFieldEdit({ value, config, onChange }: FieldEditProps) {
  const num = typeof value === "number" ? value : parseInt(String(value), 10) || 0;
  const max = config.max_rating || 5;
  const icon = config.rating_icon || "star";
  const filled = icon === "heart" ? "\u2665" : "\u2605";
  const empty = icon === "heart" ? "\u2661" : "\u2606";

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1 === num ? 0 : i + 1)}
          className="text-lg text-yellow-400 hover:scale-110 transition-transform cursor-pointer"
        >
          {i < num ? filled : empty}
        </button>
      ))}
    </div>
  );
}
