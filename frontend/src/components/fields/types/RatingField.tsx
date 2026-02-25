"use client";

import { FieldViewProps, FieldEditProps } from "../types";

const ICONS: Record<string, { filled: string; empty: string }> = {
  star: { filled: "\u2605", empty: "\u2606" },
  heart: { filled: "\u2665", empty: "\u2661" },
  circle: { filled: "\u25CF", empty: "\u25CB" },
};

export function RatingFieldView({ value, config, surface, displayConfig }: FieldViewProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const num = typeof value === "number" ? value : parseInt(String(value), 10) || 0;
  const max = displayConfig?.maxRating || config.max_rating || 5;
  const iconKey = displayConfig?.ratingIcon || config.rating_icon || "star";
  const variant = displayConfig?.variant || "stars";

  // Numeric variant: just show "3/5"
  if (variant === "numeric") {
    return <span className="text-sm text-foreground tabular-nums">{num}/{max}</span>;
  }

  // Dots variant
  if (variant === "dots") {
    return (
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full ${i < num ? "bg-yellow-400" : "bg-accent"}`}
          />
        ))}
      </span>
    );
  }

  // Default: stars/hearts (icon-based)
  const icons = ICONS[iconKey] || ICONS.star;
  return (
    <span className="text-yellow-400 text-sm tracking-wide">
      {icons.filled.repeat(Math.min(num, max))}
      {icons.empty.repeat(Math.max(max - num, 0))}
    </span>
  );
}

export function RatingFieldEdit({ value, config, onChange }: FieldEditProps) {
  const num = typeof value === "number" ? value : parseInt(String(value), 10) || 0;
  const max = config.max_rating || 5;
  const iconKey = config.rating_icon || "star";
  const icons = ICONS[iconKey] || ICONS.star;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1 === num ? 0 : i + 1)}
          className="text-lg text-yellow-400 hover:scale-110 transition-transform cursor-pointer"
        >
          {i < num ? icons.filled : icons.empty}
        </button>
      ))}
    </div>
  );
}
