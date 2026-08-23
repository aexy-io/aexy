// The "record locator" heading pattern of the Open Ledger look: a mono
// eyebrow like "SYS/02 — PLATFORM", a display-face title, and an optional
// lede. Server component — pure markup.
export function SectionHeading({
  locator,
  title,
  lede,
  align = "left",
}: {
  locator: string;
  title: string;
  lede?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="mb-4 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
        {locator}
      </p>
      <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
        {title}
      </h2>
      {lede && (
        <p className="mt-5 text-lg leading-8 text-ledger-ink/65">{lede}</p>
      )}
    </div>
  );
}
