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

// Public pages are ISR. The window is short rather than absent because these
// pages are anonymous and identical for every reader — but it is only half the
// story: a new post also invalidates its thread's tag through the revalidate
// server action, so a reply does not wait out the clock before anyone can see
// it. See `revalidateCommunityTopic` in app/community/actions.ts.
const REVALIDATE_SECONDS = 300;

// Comfortably above a healthy response, well under Next's 60s per-route
// prerender limit. See the deadline note in `getJson`.
const FETCH_TIMEOUT_MS = 10_000;

/** Cache tag for everything under one community. */
export function communityTag(slug: string): string {
  return `community:${slug}`;
}

/** Cache tag for a single thread, so one reply invalidates one page. */
export function topicTag(slug: string, channelSlug: string, topicParam: string): string {
  return `community-topic:${slug}:${channelSlug}:${topicParam}`;
}

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
  allow_participation: boolean;
  allow_new_topics: boolean;
  channels: PublicChannelSummary[];
}

export interface PublicTopicSummary {
  slug: string | null;
  short_id: string | null;
  name: string;
  message_count: number;
  last_message_at: string | null;
  created_at: string | null;
  is_answered: boolean;
}

export interface PublicChannel {
  slug: string;
  name: string;
  description: string | null;
  topics: PublicTopicSummary[];
  total: number;
}

export interface PublicReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface PublicMessage {
  id: string;
  author: string;
  /** Absent when the author posts anonymously — there is no profile to link to. */
  author_handle: string | null;
  content: string;
  is_edited: boolean;
  created_at: string;
  reactions: PublicReaction[];
  is_accepted: boolean;
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
  accepted_message_id: string | null;
}

export interface SearchHit {
  channel_slug: string;
  channel_name: string;
  topic_slug: string | null;
  short_id: string | null;
  name: string;
  snippet: string | null;
  message_count: number;
  last_message_at: string | null;
  is_answered: boolean;
}

export interface SearchResults {
  query: string;
  hits: SearchHit[];
  total: number;
}

export interface MemberProfile {
  handle: string;
  display_name: string;
  joined_at: string | null;
  topic_count: number;
  message_count: number;
  accepted_answer_count: number;
  topics: SearchHit[];
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

export interface FeedEntry {
  path: string;
  title: string;
  channel_name: string;
  description: string;
  published_at: string | null;
}

export interface CommunityFeed {
  community_slug: string;
  title: string | null;
  description: string | null;
  noindex: boolean;
  entries: FeedEntry[];
}

async function getJson<T>(path: string, tags: string[] = []): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API_BASE}/public/community${path}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags },
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
  return getJson<CommunityDirectory>("", ["community-directory"]);
}

export function getCommunity(slug: string): Promise<PublicCommunity | null> {
  return getJson<PublicCommunity>(`/${encodeURIComponent(slug)}`, [communityTag(slug)]);
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
    [communityTag(slug)],
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
    [communityTag(slug), topicTag(slug, channelSlug, topicParam)],
  );
}

export function searchCommunity(
  slug: string,
  query: string,
  page = 0,
  limit = 20,
): Promise<SearchResults | null> {
  const offset = page * limit;
  return getJson<SearchResults>(
    `/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
    [communityTag(slug)],
  );
}

export function getMemberProfile(
  slug: string,
  handle: string,
): Promise<MemberProfile | null> {
  return getJson<MemberProfile>(
    `/${encodeURIComponent(slug)}/members/${encodeURIComponent(handle)}`,
    [communityTag(slug)],
  );
}

export function getCommunitySitemap(slug: string): Promise<CommunitySitemap | null> {
  return getJson<CommunitySitemap>(`/${encodeURIComponent(slug)}/sitemap`, [
    communityTag(slug),
  ]);
}

export function getCommunityFeed(
  slug: string,
  channelSlug?: string,
): Promise<CommunityFeed | null> {
  const q = channelSlug ? `?channel=${encodeURIComponent(channelSlug)}` : "";
  return getJson<CommunityFeed>(`/${encodeURIComponent(slug)}/feed${q}`, [
    communityTag(slug),
  ]);
}

/** Absolute base URL of the public site (for canonical/OG/sitemap URLs). */
export function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://aexy.io";
}

/** Topics/messages per page on the public pages. */
export const PAGE_SIZE = 50;

/**
 * Read a `?page=` value as a zero-based page index.
 *
 * Anything that isn't a positive integer is page one, so a hand-edited or
 * crawler-mangled URL renders the first page instead of an error. Capped
 * because `?page=1e9` would otherwise be an invitation to make the database
 * count to a billion.
 */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n - 1, 1000);
}

/**
 * Accent colour for a tenant's forum, or null.
 *
 * Validated to a hex literal because the value is admin-authored and ends up
 * inside a `style` attribute: "any string the API returned" in a CSS custom
 * property is a way to smuggle in declarations, and a forum's brand colour has
 * no reason to be anything but a colour.
 */
export function themeAccent(theme: Record<string, unknown> | undefined): string | null {
  const raw = theme?.accent ?? theme?.accent_color ?? theme?.primary;
  if (typeof raw !== "string") return null;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.trim()) ? raw.trim() : null;
}
