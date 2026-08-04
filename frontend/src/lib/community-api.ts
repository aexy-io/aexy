/**
 * Server-side data layer for the public community forum (SSR).
 *
 * These run in React Server Components, so they fetch the backend directly. In
 * Docker the browser-facing NEXT_PUBLIC_API_URL (localhost:8000) is not
 * reachable from inside the frontend container, so we prefer INTERNAL_API_URL
 * (e.g. http://backend:8000/api/v1) and fall back to the public URL for local
 * dev where localhost works for both.
 */

const SERVER_API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api/v1";

// Public pages are ISR — revalidate every 5 minutes. Phase 3 hardening will add
// on-demand revalidateTag on new public messages.
const REVALIDATE_SECONDS = 300;

// Comfortably above a healthy response, well under Next's 60s per-route
// prerender limit. See the deadline note in `getJson`.
const FETCH_TIMEOUT_MS = 10_000;

export interface DirectoryItem {
  community_slug: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  channel_count: number;
  topic_count: number;
}

export interface CommunityDirectory {
  communities: DirectoryItem[];
}

export interface PublicChannelSummary {
  slug: string;
  name: string;
  description: string | null;
  topic_count: number;
  message_count: number;
  last_message_at: string | null;
}

export interface PublicCommunity {
  community_slug: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  theme: Record<string, unknown>;
  noindex: boolean;
  channels: PublicChannelSummary[];
}

export interface PublicTopicSummary {
  slug: string | null;
  short_id: string | null;
  name: string;
  message_count: number;
  last_message_at: string | null;
  created_at: string | null;
}

export interface PublicChannel {
  slug: string;
  name: string;
  description: string | null;
  topics: PublicTopicSummary[];
  total: number;
}

export interface PublicMessage {
  id: string;
  author: string;
  content: string;
  is_edited: boolean;
  created_at: string;
}

export interface PublicTopic {
  channel_slug: string;
  channel_name: string;
  topic_slug: string | null;
  short_id: string | null;
  name: string;
  messages: PublicMessage[];
  total: number;
  allow_participation: boolean;
}

export interface SitemapEntry {
  path: string;
  lastmod: string | null;
}

export interface CommunitySitemap {
  community_slug: string;
  noindex: boolean;
  entries: SitemapEntry[];
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API_BASE}/public/community${path}`, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { Accept: "application/json" },
      // Bounded on purpose. Every caller here already treats a failure as "no
      // data", but without a deadline a backend that accepts the connection and
      // then stalls leaves this awaiting forever — which fails the *production
      // build*, not just a page: `sitemap.xml/route` is prerendered, and Next
      // aborts the whole export when a route exceeds 60s. An empty sitemap is a
      // far better outcome than an unbuildable app.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function getCommunityDirectory(): Promise<CommunityDirectory | null> {
  return getJson<CommunityDirectory>("");
}

export function getCommunity(slug: string): Promise<PublicCommunity | null> {
  return getJson<PublicCommunity>(`/${encodeURIComponent(slug)}`);
}

export function getCommunityChannel(
  slug: string,
  channelSlug: string,
  page = 0,
  limit = 50,
): Promise<PublicChannel | null> {
  const offset = page * limit;
  return getJson<PublicChannel>(
    `/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channelSlug)}?limit=${limit}&offset=${offset}`,
  );
}

export function getCommunityTopic(
  slug: string,
  channelSlug: string,
  topicParam: string,
  page = 0,
  limit = 50,
): Promise<PublicTopic | null> {
  const offset = page * limit;
  return getJson<PublicTopic>(
    `/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channelSlug)}/topics/${encodeURIComponent(topicParam)}?limit=${limit}&offset=${offset}`,
  );
}

export function getCommunitySitemap(slug: string): Promise<CommunitySitemap | null> {
  return getJson<CommunitySitemap>(`/${encodeURIComponent(slug)}/sitemap`);
}

/** Absolute base URL of the public site (for canonical/OG/sitemap URLs). */
export function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://aexy.io";
}
