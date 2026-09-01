import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Rendered when a community/channel/topic under /community/{slug} calls
 * notFound() (unknown slug, disabled community, or a non-public path). Friendlier
 * than the bare app 404 and points visitors to the public directory.
 */
export default async function CommunityNotFound() {
  const t = await getTranslations("community");

  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {t("notFound.title")}
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-ledger-ink/70">
        {t("notFound.body")}
      </p>
      <Link
        href="/community"
        className="mt-6 inline-block rounded-[3px] bg-ledger-ink px-4 py-2 text-sm text-ledger-paper transition hover:bg-ledger-ink/85"
      >
        {t("notFound.browse")}
      </Link>
    </div>
  );
}
