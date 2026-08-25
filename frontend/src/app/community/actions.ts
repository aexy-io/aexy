"use server";

import { revalidateTag, updateTag } from "next/cache";
import { communityTag, topicTag } from "@/lib/community-api";

const SERVER_API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api/v1";

/**
 * Drop the cached copy of one community thread after somebody posts in it.
 *
 * Public forum pages are ISR, which is right for pages that are identical for
 * every anonymous reader — but it means a reply would sit invisible for the
 * length of the window, and the person who wrote it reads that as "my post
 * didn't save". The composer renders its own post optimistically; this is the
 * other half, so the *next* visitor sees it too.
 *
 * It takes the poster's token and checks it against the backend first. A server
 * action is a public endpoint: without that check, "invalidate any page in any
 * community" would be callable by anyone, forever, for free. The check does not
 * ask whether the caller may post — the API already decided that when it
 * accepted the post — only that a real session is behind the call.
 */
export async function revalidateCommunityTopic(
  token: string,
  communitySlug: string,
  channelSlug: string,
  topicParam: string,
): Promise<{ revalidated: boolean }> {
  if (!token) return { revalidated: false };

  try {
    const res = await fetch(`${SERVER_API_BASE}/developers/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { revalidated: false };
  } catch {
    return { revalidated: false };
  }

  // updateTag, not revalidateTag: this is read-your-own-writes. It expires the
  // thread immediately, so the next request for it waits for fresh data rather
  // than serving a copy that is missing the post that just triggered this.
  updateTag(topicTag(communitySlug, channelSlug, topicParam));
  // The channel and community pages carry the thread's activity timestamp and
  // counts, so they are stale too — but nobody is staring at them waiting, so
  // stale-while-revalidate is the right trade there.
  revalidateTag(communityTag(communitySlug), "max");
  return { revalidated: true };
}
