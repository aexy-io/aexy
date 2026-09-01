import { displayFont, brandMonoFont } from "@/lib/fonts";

/**
 * Loading state for the directory at /community.
 *
 * Its own file rather than the one under [communitySlug]: the directory sits
 * above that layout and therefore owns its own brand shell, so a skeleton
 * inheriting the layout's chrome would render unstyled here.
 */
export default function DirectoryLoading() {
  return (
    <div
      className={`theme-ledger ${displayFont.variable} ${brandMonoFont.variable} min-h-screen bg-ledger-paper`}
    >
      <div className="mx-auto max-w-4xl animate-pulse px-4 py-10 sm:px-6" aria-hidden>
        <div className="h-10 w-1/2 rounded-[3px] bg-ledger-ink/10" />
        <div className="mt-4 h-4 w-full max-w-xl rounded-[3px] bg-ledger-ink/[0.07]" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-[3px] border border-ledger-ink/12 bg-ledger-card"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
