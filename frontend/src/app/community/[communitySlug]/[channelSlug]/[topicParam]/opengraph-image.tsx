import { ImageResponse } from "next/og";
import { getCommunity, getCommunityTopic } from "@/lib/community-api";

export const alt = "Community thread";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social card for one thread.
 *
 * Without this, every thread shared to Hacker News or X rendered the generic
 * site card — the same image for a support answer, a feature request, and the
 * home page. The card carries the thread's title and the community it is in,
 * which is the whole of what a reader needs to decide whether to click.
 *
 * Same "Open Ledger" palette as src/app/opengraph-image.tsx, so a shared thread
 * looks like it came from the same place as the marketing site.
 */
export default async function TopicOgImage({
  params,
}: {
  params: Promise<{ communitySlug: string; channelSlug: string; topicParam: string }>;
}) {
  const { communitySlug, channelSlug, topicParam } = await params;
  const [community, topic] = await Promise.all([
    getCommunity(communitySlug),
    getCommunityTopic(communitySlug, channelSlug, topicParam),
  ]);

  const communityName = community?.title || "Community";
  const heading = topic?.name || communityName;
  // Long titles shrink rather than overflow; two sizes cover the realistic range.
  const fontSize = heading.length > 70 ? 52 : 68;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#F2F3EE",
          color: "#101913",
          fontFamily: "sans-serif",
          borderTop: "16px solid #0B6B3A",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "26px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#101913",
            opacity: 0.55,
          }}
        >
          <span>{communityName}</span>
          <span>·</span>
          <span>#{topic?.channel_name || channelSlug}</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: `${fontSize}px`,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            maxWidth: "1000px",
          }}
        >
          {heading}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "24px",
            color: "#101913",
            opacity: 0.5,
          }}
        >
          <span>
            {topic ? `${topic.total} ${topic.total === 1 ? "message" : "messages"}` : ""}
          </span>
          <span>aexy.io</span>
        </div>
      </div>
    ),
    size,
  );
}
