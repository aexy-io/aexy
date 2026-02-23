"""Content gap analysis service — compares our domain against competitors."""

import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_content import ContentAnalysis

logger = logging.getLogger(__name__)

MAX_URLS_PER_DOMAIN = 50
MAX_COMPETITORS = 5
SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
# Segments that carry no topical meaning
STOP_SEGMENTS = frozenset({
    "", "blog", "posts", "articles", "pages", "en", "us", "www",
    "category", "tag", "tags", "categories", "index", "home",
})


class ContentGapService:
    """Analyse content gaps between our domain and competitors."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_analysis(
        self,
        workspace_id: str,
        our_domain: str,
        competitor_domains: list[str],
        triggered_by: str | None = None,
    ) -> ContentAnalysis:
        """Create a new pending content-gap analysis."""
        analysis = ContentAnalysis(
            id=str(uuid4()),
            workspace_id=workspace_id,
            our_domain=our_domain.strip().lower(),
            competitor_domains=[d.strip().lower() for d in competitor_domains[:MAX_COMPETITORS]],
            status="pending",
            triggered_by=triggered_by,
        )
        self.db.add(analysis)
        await self.db.flush()
        return analysis

    async def list_analyses(
        self, workspace_id: str, page: int = 1, per_page: int = 50,
    ) -> tuple[list[ContentAnalysis], int]:
        """Return paginated analyses for a workspace."""
        base = select(ContentAnalysis).where(
            ContentAnalysis.workspace_id == workspace_id,
        )
        total_q = select(func.count()).select_from(base.subquery())
        total: int = (await self.db.execute(total_q)).scalar_one()

        rows_q = (
            base
            .order_by(ContentAnalysis.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        rows = (await self.db.execute(rows_q)).scalars().all()
        return list(rows), total

    async def get_analysis(
        self, workspace_id: str, analysis_id: str,
    ) -> ContentAnalysis | None:
        """Return a single analysis or None."""
        q = select(ContentAnalysis).where(
            and_(
                ContentAnalysis.id == analysis_id,
                ContentAnalysis.workspace_id == workspace_id,
            ),
        )
        return (await self.db.execute(q)).scalar_one_or_none()

    async def delete_analysis(
        self, workspace_id: str, analysis_id: str,
    ) -> bool:
        """Delete an analysis. Returns True if a row was removed."""
        result = await self.db.execute(
            delete(ContentAnalysis).where(
                and_(
                    ContentAnalysis.id == analysis_id,
                    ContentAnalysis.workspace_id == workspace_id,
                ),
            ),
        )
        await self.db.flush()
        return result.rowcount > 0  # type: ignore[union-attr]

    # ------------------------------------------------------------------
    # Analysis runner
    # ------------------------------------------------------------------

    async def run_analysis(self, analysis_id: str) -> ContentAnalysis:
        """Fetch sitemaps, extract topics, compute gaps & opportunities."""
        analysis = (
            await self.db.execute(
                select(ContentAnalysis).where(ContentAnalysis.id == analysis_id),
            )
        ).scalar_one_or_none()
        if analysis is None:
            raise ValueError(f"Analysis {analysis_id} not found")

        now = datetime.now(timezone.utc)
        analysis.status = "running"
        analysis.started_at = now
        await self.db.flush()

        try:
            # 1. Fetch sitemaps concurrently
            our_urls = await self._fetch_sitemap(analysis.our_domain)
            competitor_tasks = [
                self._fetch_sitemap(domain)
                for domain in analysis.competitor_domains
            ]
            competitor_results = await asyncio.gather(
                *competitor_tasks, return_exceptions=True,
            )

            all_competitor_urls: list[str] = []
            for result in competitor_results:
                if isinstance(result, Exception):
                    logger.warning("Sitemap fetch failed: %s", result)
                    continue
                all_competitor_urls.extend(result)

            pages_analyzed = len(our_urls) + len(all_competitor_urls)

            # 2. Extract topics
            our_topics = self._extract_topics(our_urls)
            competitor_topics = self._extract_topics(all_competitor_urls)

            our_slugs = {t["slug"] for t in our_topics}
            comp_slugs = {t["slug"] for t in competitor_topics}

            # 3. Gaps: competitors have it, we don't
            gap_slugs = comp_slugs - our_slugs
            gaps = [t for t in competitor_topics if t["slug"] in gap_slugs]
            seen: set[str] = set()
            unique_gaps: list[dict[str, Any]] = []
            for g in gaps:
                if g["slug"] not in seen:
                    seen.add(g["slug"])
                    unique_gaps.append(g)

            # 4. Opportunities: we have it, competitors don't
            opp_slugs = our_slugs - comp_slugs
            opportunities = [t for t in our_topics if t["slug"] in opp_slugs]
            seen_opp: set[str] = set()
            unique_opps: list[dict[str, Any]] = []
            for o in opportunities:
                if o["slug"] not in seen_opp:
                    seen_opp.add(o["slug"])
                    unique_opps.append(o)

            # 5. Summary (placeholder — no LLM call)
            summary = (
                f"Analyzed {pages_analyzed} pages across "
                f"{1 + len(analysis.competitor_domains)} domains. "
                f"Found {len(unique_gaps)} content gap(s) and "
                f"{len(unique_opps)} unique opportunity(ies)."
            )

            analysis.our_topics = our_topics
            analysis.competitor_topics = competitor_topics
            analysis.gaps = unique_gaps
            analysis.opportunities = unique_opps
            analysis.summary = summary
            analysis.pages_analyzed = pages_analyzed
            analysis.status = "completed"
            analysis.completed_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.exception("Content gap analysis %s failed", analysis_id)
            analysis.status = "failed"
            analysis.error_message = str(exc)[:2000]

        await self.db.flush()
        return analysis

    # ------------------------------------------------------------------
    # Sitemap fetching
    # ------------------------------------------------------------------

    async def _fetch_sitemap(self, domain: str) -> list[str]:
        """Fetch up to MAX_URLS_PER_DOMAIN URLs from a domain's sitemap."""
        urls: list[str] = []
        paths_to_try = ["/sitemap.xml", "/sitemap_index.xml"]

        async with httpx.AsyncClient(
            timeout=10, follow_redirects=True,
        ) as client:
            for path in paths_to_try:
                sitemap_url = f"https://{domain}{path}"
                try:
                    resp = await client.get(sitemap_url)
                    if resp.status_code != 200:
                        continue
                    urls = await self._parse_sitemap(client, resp.text)
                    if urls:
                        break
                except httpx.HTTPError:
                    continue

        return urls[:MAX_URLS_PER_DOMAIN]

    async def _parse_sitemap(
        self, client: httpx.AsyncClient, xml_text: str,
    ) -> list[str]:
        """Parse sitemap XML. If it's a sitemap index, fetch children."""
        try:
            root = ET.fromstring(xml_text)  # noqa: S314
        except ET.ParseError:
            return []

        # Detect sitemap index by looking for <sitemap> elements
        is_index = bool(list(root.iter(f"{SITEMAP_NS}sitemap")))

        if is_index:
            all_urls: list[str] = []
            sitemap_locs = [
                loc_el.text
                for sm in root.iter(f"{SITEMAP_NS}sitemap")
                for loc_el in sm.iter(f"{SITEMAP_NS}loc")
                if loc_el.text
            ]
            for loc in sitemap_locs:
                if len(all_urls) >= MAX_URLS_PER_DOMAIN:
                    break
                try:
                    resp = await client.get(loc)
                    if resp.status_code != 200:
                        continue
                    child_root = ET.fromstring(resp.text)  # noqa: S314
                    for url_el in child_root.iter(f"{SITEMAP_NS}loc"):
                        if url_el.text:
                            all_urls.append(url_el.text)
                            if len(all_urls) >= MAX_URLS_PER_DOMAIN:
                                break
                except (httpx.HTTPError, ET.ParseError):
                    continue
            return all_urls[:MAX_URLS_PER_DOMAIN]

        # Regular urlset
        return [
            el.text
            for el in root.iter(f"{SITEMAP_NS}loc")
            if el.text
        ][:MAX_URLS_PER_DOMAIN]

    # ------------------------------------------------------------------
    # Topic extraction
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_topics(urls: list[str]) -> list[dict[str, str]]:
        """Derive topics from URL paths.

        Returns a list of ``{"url": …, "topic": …, "slug": …}`` dicts.
        """
        topics: list[dict[str, str]] = []
        for url in urls:
            # Strip scheme + domain to get the path
            path = re.sub(r"^https?://[^/]+", "", url).rstrip("/")
            if not path or path == "/":
                continue

            segments = [
                seg.replace("-", " ").replace("_", " ").strip()
                for seg in path.split("/")
                if seg.lower() not in STOP_SEGMENTS and seg.strip()
            ]
            if not segments:
                continue

            topic = segments[-1].title()
            slug = re.sub(r"\s+", "-", segments[-1].strip().lower())
            if not slug:
                continue

            topics.append({"url": url, "topic": topic, "slug": slug})
        return topics
