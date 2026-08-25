import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Prev/next links for a paged public list.
 *
 * The API has always taken `limit`/`offset`, but no page ever read a page
 * parameter — so topic 51 and message 51 existed and could not be reached, by a
 * person or by a crawler. These are real `<a href>`s with a `?page=` query, not
 * buttons, precisely so a crawler follows them.
 */
export async function Pagination({
  basePath,
  page,
  total,
  pageSize,
}: {
  /** Path without the page query, e.g. `/community/acme/help`. */
  basePath: string;
  /** Zero-based current page. */
  page: number;
  total: number;
  pageSize: number;
}) {
  const t = await getTranslations("community");
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  if (lastPage === 0) return null;

  // basePath may already carry a query (the search page passes `?q=…`), so pick
  // the separator rather than always appending "?" and producing "?q=x?page=2".
  const join = basePath.includes("?") ? "&" : "?";
  const href = (p: number) => (p === 0 ? basePath : `${basePath}${join}page=${p + 1}`);
  const linkClass =
    "inline-flex items-center gap-1.5 rounded-[3px] border border-ledger-ink/15 bg-ledger-card px-3 py-1.5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/70 transition hover:border-ledger-ink/35 hover:text-ledger-ink";

  return (
    <nav
      aria-label={t("pagination.label")}
      className="mt-8 flex items-center justify-between gap-3"
    >
      {page > 0 ? (
        <Link href={href(page - 1)} rel="prev" className={linkClass}>
          <ChevronLeft className="h-3.5 w-3.5" />
          {t("pagination.previous")}
        </Link>
      ) : (
        <span />
      )}

      <span className="font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45">
        {t("pagination.position", { page: page + 1, total: lastPage + 1 })}
      </span>

      {page < lastPage ? (
        <Link href={href(page + 1)} rel="next" className={linkClass}>
          {t("pagination.next")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
