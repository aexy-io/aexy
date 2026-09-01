-- Migration: repair channel slugs the public forum routes would shadow.
--
-- Split from migrate_2026_08_25_community_launch.sql rather than appended to it.
-- That file has already been applied, and the schema_migrations checksum exists
-- precisely so an applied migration cannot be edited underneath a database that
-- ran the earlier version.

-- /community/{slug}/search and /community/{slug}/members/… are static path
-- segments in the frontend router, and a static segment always beats the
-- dynamic [channelSlug] beside it. A channel slugged "search" or "members" is
-- therefore reachable internally and 404s publicly.
--
-- Such a channel is already broken, so re-slugging it strictly improves things:
-- nothing public can be linking to a URL that never resolved. New ones are
-- prevented at the point slugs are minted (RESERVED_CHANNEL_SLUGS in
-- services/chat_service.py); this only repairs rows that predate that.

UPDATE chat_channels
SET slug = slug || '-' || substr(md5(id::text), 1, 8)
WHERE slug IN ('search', 'members', 'rss.xml', 'sitemap.xml');
