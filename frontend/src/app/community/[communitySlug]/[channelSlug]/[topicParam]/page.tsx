import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  PAGE_SIZE,
  getCommunity,
  getCommunityTopic,
  parsePage,
  siteBaseUrl,
} from "@/lib/community-api";
import { excerptFromMarkdown, plainTextFromMarkdown } from "@/lib/markdownText";
import { MarkdownContent } from "@/components/community/MarkdownContent";
import { Pagination } from "@/components/community/Pagination";
import { TopicThread } from "./TopicThread";

export const revalidate = 300;

interface Props {
  params: Promise<{ communitySlug: string; channelSlug: string; topicParam: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ communitySlug, channelSlug, topicParam }, { page: rawPage }] =
    await Promise.all([params, searchParams]);
  const page = parsePage(rawPage);
  const [community, topic] = await Promise.all([
    getCommunity(communitySlug),
    getCommunityTopic(communitySlug, channelSlug, topicParam, page),
  ]);
  if (!community || !topic) return { title: "Topic not found" };

  const title = topic.name;
  // Posts are markdown, so the opening one is flattened before it becomes a
  // description — otherwise the snippet Google shows is the source, hashes and
  // bullets included.
  const first = excerptFromMarkdown(topic.messages[0]?.content ?? "", 180);
  const description = first || `Discussion in #${topic.channel_name}.`;
  const base = `${siteBaseUrl()}/community/${communitySlug}/${channelSlug}/${topicParam}`;
  // A near-empty topic isn't worth indexing.
  const thin = topic.total < 1;
  return {
    title,
    description,
    alternates: { canonical: page === 0 ? base : `${base}?page=${page + 1}` },
    robots: community.noindex || thin ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: base, type: "article" },
  };
}

/**
 * Serialize a JSON-LD object for embedding in a <script> via
 * dangerouslySetInnerHTML. JSON.stringify does NOT escape "<", ">", or the JS
 * line separators, so user-authored content (topic titles, message bodies)
 * could otherwise break out of the script block (e.g. "</script>...") and
 * inject markup. Escape those code points to their \uXXXX forms — still valid
 * JSON, but inert inside HTML.
 */
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export default async function TopicPage({ params, searchParams }: Props) {
  const [{ communitySlug, channelSlug, topicParam }, { page: rawPage }] =
    await Promise.all([params, searchParams]);
  const page = parsePage(rawPage);
  const [topic, t] = await Promise.all([
    getCommunityTopic(communitySlug, channelSlug, topicParam, page),
    getTranslations("community"),
  ]);
  if (!topic) notFound();

  const base = siteBaseUrl();
  const url = `${base}/community/${communitySlug}/${channelSlug}/${topicParam}`;

  const question = topic.messages[0];
  const answer = topic.accepted_message_id
    ? topic.messages.find((m) => m.id === topic.accepted_message_id)
    : undefined;
  const others = topic.messages.slice(1).filter((m) => m.id !== answer?.id);

  // Structured data. A thread with a marked answer is described as a QAPage with
  // an acceptedAnswer rather than a plain forum posting — that distinction is
  // what earns the answer its own treatment in search results, and it is the
  // whole reason marking one is worth a UI.
  const threadJsonLd = answer
    ? {
        "@context": "https://schema.org",
        "@type": "QAPage",
        mainEntity: {
          "@type": "Question",
          name: topic.name,
          url,
          answerCount: topic.total - 1,
          ...(question && {
            text: plainTextFromMarkdown(question.content),
            datePublished: question.created_at,
            author: { "@type": "Person", name: question.author },
          }),
          acceptedAnswer: {
            "@type": "Answer",
            text: plainTextFromMarkdown(answer.content),
            datePublished: answer.created_at,
            url: `${url}#${answer.id}`,
            author: { "@type": "Person", name: answer.author },
          },
          ...(others.length > 0 && {
            suggestedAnswer: others.map((m) => ({
              "@type": "Answer",
              text: plainTextFromMarkdown(m.content),
              datePublished: m.created_at,
              author: { "@type": "Person", name: m.author },
            })),
          }),
        },
      }
    : {
        "@context": "https://schema.org",
        "@type": "DiscussionForumPosting",
        headline: topic.name,
        url,
        ...(question && {
          datePublished: question.created_at,
          author: { "@type": "Person", name: question.author },
          text: plainTextFromMarkdown(question.content),
        }),
        interactionStatistic: {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/CommentAction",
          userInteractionCount: topic.total,
        },
        comment: topic.messages.slice(1).map((m) => ({
          "@type": "Comment",
          text: plainTextFromMarkdown(m.content),
          datePublished: m.created_at,
          author: { "@type": "Person", name: m.author },
        })),
      };

  // Markdown is parsed here, on the server, and the thread receives elements.
  // TopicThread has to be a client component to be interactive, but that is no
  // reason to send a markdown parser to every anonymous reader of a page whose
  // posts never change after render.
  const bodies = Object.fromEntries(
    topic.messages.map((m) => [m.id, <MarkdownContent key={m.id} content={m.content} />]),
  );

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Community",
        item: `${base}/community/${communitySlug}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: `#${topic.channel_name}`,
        item: `${base}/community/${communitySlug}/${channelSlug}`,
      },
      { "@type": "ListItem", position: 3, name: topic.name, item: url },
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(threadJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      <nav
        aria-label={t("nav.breadcrumb")}
        className="mb-5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/45"
      >
        <Link
          href={`/community/${communitySlug}`}
          className="transition hover:text-ledger-ink"
        >
          {t("nav.community")}
        </Link>{" "}
        /{" "}
        <Link
          href={`/community/${communitySlug}/${channelSlug}`}
          className="transition hover:text-ledger-ink"
        >
          #{topic.channel_name}
        </Link>
      </nav>

      <h1 className="mb-7 font-display text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
        {topic.name}
      </h1>

      <TopicThread
        communitySlug={communitySlug}
        channelSlug={channelSlug}
        topicParam={topicParam}
        messages={topic.messages}
        bodies={bodies}
        acceptedMessageId={topic.accepted_message_id}
        allowParticipation={topic.allow_participation}
        isFirstPage={page === 0}
      />

      <Pagination
        basePath={`/community/${communitySlug}/${channelSlug}/${topicParam}`}
        page={page}
        total={topic.total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
