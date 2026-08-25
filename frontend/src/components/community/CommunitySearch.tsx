import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Search box for the public forum.
 *
 * A plain GET form, not a client component: it navigates to a server-rendered
 * results page, so there is nothing for JavaScript to add — and this way it
 * works before hydration, works with scripting off, and the results page it
 * lands on is an ordinary crawlable URL rather than client-side state.
 */
export async function CommunitySearch({
  communitySlug,
  defaultValue = "",
  autoFocus = false,
}: {
  communitySlug: string;
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const t = await getTranslations("community");

  return (
    <form
      action={`/community/${communitySlug}/search`}
      method="get"
      role="search"
      className="relative flex items-center"
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ledger-ink/40"
      />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        aria-label={t("search.label")}
        placeholder={t("search.placeholder")}
        className="w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-card py-1.5 pl-8 pr-3 text-sm text-ledger-ink placeholder:text-ledger-ink/40 focus:border-ledger-ink/35 focus:outline-none"
      />
    </form>
  );
}
