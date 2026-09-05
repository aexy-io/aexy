"use server";

import type { ReactNode } from "react";
import { MarkdownContent } from "@/components/community/MarkdownContent";

/** Matches the API's cap on a reply body (TopicCreate / PublicReplyCreate). */
const MAX_CONTENT = 10_000;

/**
 * Render one post's markdown on the server and hand back the elements.
 *
 * Every post on a thread is rendered server-side and arrives as props, which is
 * what keeps react-markdown and micromark — around 140kB — out of the client
 * bundle of a public, anonymously-read page. A reply the visitor has just
 * written is the one post with no server-rendered copy: the page it belongs to
 * is cached, and the composer shows the reply immediately so that posting does
 * not read as a failed save. This action fills that gap, so the author's own
 * post looks like every other one without shipping a parser to do it.
 *
 * A server action is a public endpoint, so the length is capped here rather than
 * trusted from the caller — the same limit the API enforces on the post itself.
 * There is nothing else to guard: this reads no data and touches no session, and
 * MarkdownContent renders no raw HTML.
 */
export async function renderCommunityMarkdown(content: string): Promise<ReactNode> {
  if (!content || content.length > MAX_CONTENT) return null;
  return <MarkdownContent content={content} />;
}
