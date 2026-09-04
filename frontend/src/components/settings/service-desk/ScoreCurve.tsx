"use client";

import { useMemo } from "react";

/**
 * The scoring curve, drawn.
 *
 * "Benchmark 4, penalty 10" is two numbers; the same thing as a shape is
 * judgeable at a glance. It also makes a mis-set direction obvious in a way a
 * dropdown reading "higher is better" is not — a curve sloping the wrong way is
 * visible, a wrong word is not.
 *
 * Deliberately no axis furniture beyond the two end labels: this is a sparkline
 * for orientation, not a chart to read values off. The numbers are in the fields
 * right next to it.
 */

const W = 160;
const H = 56;
const PAD = 4;

export function ScoreCurve({
  direction,
  benchmark,
  penaltyPerUnit,
  target,
  unit,
}: {
  direction: "higher_is_better" | "lower_is_better";
  benchmark?: number | null;
  penaltyPerUnit?: number | null;
  target?: number | null;
  unit?: string;
}) {
  const curve = useMemo(() => {
    const lower = direction === "lower_is_better";
    // The domain is chosen so the interesting part — where the score actually
    // moves — fills the box. A fixed domain would show a flat line for most
    // real settings.
    let max: number;
    if (lower) {
      const b = Number(benchmark) || 0;
      const p = Number(penaltyPerUnit) || 0;
      // Where the score reaches zero, plus a margin so the floor is visible.
      const zeroAt = p > 0 ? b + 100 / p : b * 2 || 1;
      max = Math.max(zeroAt * 1.15, b * 1.5, 1);
    } else {
      const t = Number(target) || 0;
      max = Math.max(t * 1.25, 1);
    }

    const score = (v: number) => {
      if (lower) {
        const b = Number(benchmark) || 0;
        const p = Number(penaltyPerUnit) || 0;
        return Math.max(0, Math.min(100, 100 - Math.max(0, v - b) * p));
      }
      const t = Number(target) || 0;
      if (t <= 0) return 0;
      return Math.max(0, Math.min(100, (v / t) * 100));
    };

    const steps = 48;
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = (max * i) / steps;
      const x = PAD + ((W - PAD * 2) * i) / steps;
      const y = PAD + (H - PAD * 2) * (1 - score(v) / 100);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { points: points.join(" "), max };
  }, [direction, benchmark, penaltyPerUnit, target]);

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="Scoring curve"
        className="rounded border border-input bg-muted/20"
      >
        {/* The 100 and 0 rails, so the curve has something to be read against. */}
        <line x1={PAD} y1={PAD} x2={W - PAD} y2={PAD} className="stroke-muted-foreground/25" strokeWidth={1} />
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          className="stroke-muted-foreground/25"
          strokeWidth={1}
        />
        <polyline
          points={curve.points}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>
          {curve.max >= 10 ? Math.round(curve.max) : curve.max.toFixed(2)}
          {unit === "hours" ? "h" : ""}
        </span>
      </div>
    </div>
  );
}
