/**
 * Structured-data helpers for the marketing tree.
 *
 * Two gaps this closes:
 *
 * 1. Twelve of the sixteen /products/* pages emitted no JSON-LD at all, so
 *    they were ineligible for any rich result. Only crm, mcp, ai-agents and
 *    gtm-intelligence had it.
 * 2. Nothing on the site emitted BreadcrumbList. Google falls back to showing
 *    the raw URL path in the SERP; a breadcrumb trail is what turns
 *    "aexy.io › products › planning" into readable context on nested pages.
 *
 * Rendered from a route's layout.tsx (server) so client-component pages get it
 * too — a `metadata` export cannot carry JSON-LD, but a layout can render the
 * script tag.
 */

const BASE = "https://aexy.io";

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

/**
 * BreadcrumbList for a nested marketing page.
 *
 * `trail` is every step *below* the site root, in order — the last entry is
 * the current page. Home is prepended automatically.
 */
export function BreadcrumbJsonLd({ trail }: { trail: Array<{ name: string; path: string }> }) {
  const items = [{ name: "Home", path: "/" }, ...trail];
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: `${BASE}${item.path}`,
        })),
      }}
    />
  );
}

/**
 * SoftwareApplication for one Aexy module.
 *
 * `offers` states the honest position: the open-source edition is free, and
 * the paid cloud tier is a separate thing the /pricing page describes. Nothing
 * here claims a rating or a review count — the site has neither, and inventing
 * them is both against the brand rule and a manual-action risk.
 */
export function ProductJsonLd({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name,
        description,
        url: `${BASE}${path}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        isPartOf: { "@type": "SoftwareApplication", name: "Aexy", url: BASE },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Open-source edition, free to self-host.",
          url: `${BASE}/pricing`,
        },
      }}
    />
  );
}
