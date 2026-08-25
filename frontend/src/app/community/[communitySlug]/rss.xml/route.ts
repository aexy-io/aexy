import { getCommunityFeed, siteBaseUrl } from "@/lib/community-api";

export const revalidate = 900;

/**
 * RSS feed of a community's newest public threads, at
 * /community/{communitySlug}/rss.xml.
 *
 * A route handler rather than anything generated, for the same reason as the
 * sitemap next door: community slugs are created at runtime, so there is no
 * static set to enumerate. `?channel=slug` narrows it to one channel.
 *
 * A disabled or noindex community yields an empty channel — a feed is a
 * syndication surface, and a forum that asked not to be indexed did not ask to
 * be syndicated either.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ communitySlug: string }> },
) {
  const { communitySlug } = await params;
  const channel = new URL(req.url).searchParams.get("channel") || undefined;
  const data = await getCommunityFeed(communitySlug, channel);

  const base = siteBaseUrl();
  const root = `${base}/community/${communitySlug}`;
  const title = data?.title || "Community";
  const description = data?.description || "";

  const items =
    data && !data.noindex
      ? data.entries.map((entry) => {
          const link = `${root}${entry.path}`;
          const pubDate = entry.published_at
            ? `<pubDate>${new Date(entry.published_at).toUTCString()}</pubDate>`
            : "";
          return [
            "<item>",
            `<title>${xmlEscape(entry.title)}</title>`,
            `<link>${xmlEscape(link)}</link>`,
            // The permalink is the identity, and it survives a rename because
            // the short id in it is immutable.
            `<guid isPermaLink="true">${xmlEscape(link)}</guid>`,
            `<category>${xmlEscape(entry.channel_name)}</category>`,
            `<description>${xmlEscape(entry.description)}</description>`,
            pubDate,
            "</item>",
          ].join("");
        })
      : [];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xmlEscape(title)}</title>
<link>${xmlEscape(root)}</link>
<description>${xmlEscape(description)}</description>
<atom:link href="${xmlEscape(`${root}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items.join("\n")}
</channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
