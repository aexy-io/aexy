"use client";

/**
 * Shared loading skeleton for code-insights cards. Renders shapes that
 * roughly mirror a real card (title + metric chips + bullet list) so the
 * layout doesn't reflow when data arrives.
 */
export function CardSkeleton({
  showMetrics = true,
  bulletLines = 3,
}: {
  showMetrics?: boolean;
  bulletLines?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="space-y-3"
    >
      <div className="h-4 w-3/4 max-w-md rounded bg-muted animate-pulse" />
      {showMetrics && (
        <div className="flex gap-2 flex-wrap">
          <div className="h-6 w-20 rounded-md bg-muted animate-pulse" />
          <div className="h-6 w-24 rounded-md bg-muted animate-pulse" />
          <div className="h-6 w-16 rounded-md bg-muted animate-pulse" />
        </div>
      )}
      <div className="space-y-2 pt-1">
        {Array.from({ length: bulletLines }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-muted animate-pulse"
            style={{ width: `${65 + ((i * 13) % 25)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
