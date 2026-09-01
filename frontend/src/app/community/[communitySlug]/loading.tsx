/**
 * Shown while a community page's data is in flight.
 *
 * Covers every route under [communitySlug] — the channel list, a channel, a
 * thread, search and profiles all resolve to the same shape: a heading and a
 * stack of cards. A shared skeleton is honest about that and beats each route
 * flashing a bare page.
 */
export default function CommunityLoading() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="mb-10 border-b border-ledger-ink/12 pb-8">
        <div className="h-9 w-2/3 rounded-[3px] bg-ledger-ink/10" />
        <div className="mt-4 h-4 w-full max-w-xl rounded-[3px] bg-ledger-ink/[0.07]" />
        <div className="mt-2 h-4 w-1/2 rounded-[3px] bg-ledger-ink/[0.07]" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-[3px] border border-ledger-ink/12 bg-ledger-card"
          />
        ))}
      </div>
    </div>
  );
}
