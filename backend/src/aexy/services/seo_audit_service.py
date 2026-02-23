"""SEO audit service for technical SEO analysis via BFS crawling."""

import asyncio
import hashlib
import logging
import re
import time
import urllib.parse
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select, and_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_seo import SEOAudit, SEOAuditPage

logger = logging.getLogger(__name__)


class SEOAuditService:
    """Service for running technical SEO audits on websites."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # AUDIT CRUD
    # =========================================================================

    async def create_audit(
        self,
        workspace_id: str,
        target_url: str,
        record_id: str | None = None,
        triggered_by: str | None = None,
    ) -> SEOAudit:
        """Create a new SEO audit with status=pending."""
        parsed = urllib.parse.urlparse(target_url)
        domain = parsed.netloc or parsed.path.split("/")[0]
        # Strip www. prefix for consistent domain grouping
        if domain.startswith("www."):
            domain = domain[4:]

        audit = SEOAudit(
            id=str(uuid4()),
            workspace_id=workspace_id,
            target_url=target_url,
            domain=domain,
            record_id=record_id,
            triggered_by=triggered_by,
            status="pending",
        )

        self.db.add(audit)
        await self.db.commit()
        await self.db.refresh(audit)

        logger.info(f"Created SEO audit {audit.id} for {target_url} (domain={domain})")
        return audit

    async def run_audit(self, audit_id: str, max_pages: int = 20) -> SEOAudit:
        """Run the full SEO audit: BFS crawl, analyse pages, compute scores."""
        stmt = select(SEOAudit).where(SEOAudit.id == audit_id)
        result = await self.db.execute(stmt)
        audit = result.scalar_one_or_none()
        if audit is None:
            raise ValueError(f"Audit {audit_id} not found")

        audit.status = "running"
        audit.started_at = datetime.now(timezone.utc)
        await self.db.commit()

        start_time = time.monotonic()

        try:
            parsed = urllib.parse.urlparse(audit.target_url)
            domain = parsed.netloc

            visited: set[str] = set()
            queue: list[str] = [audit.target_url]
            all_page_analyses: list[dict] = []
            all_broken_links: list[str] = []

            async with httpx.AsyncClient(
                timeout=10.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "AexyBot/1.0 (SEO Audit)",
                    "Accept": "text/html,application/xhtml+xml",
                },
            ) as client:
                while queue and len(visited) < max_pages:
                    url = queue.pop(0)

                    # Normalise to avoid duplicate crawls
                    normalised = self._normalise_url(url)
                    if normalised in visited:
                        continue
                    visited.add(normalised)

                    try:
                        resp = await client.get(url)
                    except httpx.HTTPError as exc:
                        logger.warning(f"Failed to fetch {url}: {exc}")
                        page_row = SEOAuditPage(
                            id=str(uuid4()),
                            audit_id=audit_id,
                            url=url,
                            status_code=0,
                            page_score=0,
                            issues=[{
                                "type": "fetch_error",
                                "severity": "critical",
                                "detail": f"Could not fetch page: {exc}",
                            }],
                        )
                        self.db.add(page_row)
                        all_page_analyses.append({"url": url, "score": 0, "issues": page_row.issues})
                        await asyncio.sleep(0.5)
                        continue

                    content_type = resp.headers.get("content-type", "")
                    if "text/html" not in content_type:
                        await asyncio.sleep(0.5)
                        continue

                    html = resp.text
                    load_time_ms = resp.elapsed.total_seconds() * 1000
                    page_size_kb = len(resp.content) / 1024

                    analysis = self._analyze_page(url, resp)

                    page_row = SEOAuditPage(
                        id=str(uuid4()),
                        audit_id=audit_id,
                        url=url,
                        status_code=resp.status_code,
                        page_score=analysis.get("score", 0),
                        title=analysis.get("title"),
                        meta_description=analysis.get("meta_description"),
                        h1_text=analysis.get("h1"),
                        word_count=analysis.get("word_count", 0),
                        page_size_kb=round(page_size_kb, 2),
                        load_time_ms=round(load_time_ms, 2),
                        issues=analysis.get("issues", []),
                    )
                    self.db.add(page_row)

                    all_page_analyses.append(analysis)

                    # Extract internal links for BFS
                    internal_links = self._extract_links(html, url, domain)
                    for link in internal_links:
                        if self._normalise_url(link) not in visited:
                            queue.append(link)

                    await asyncio.sleep(0.5)

                # Check for broken links across all discovered internal links
                all_internal_urls: set[str] = set()
                for analysis in all_page_analyses:
                    for link in analysis.get("internal_links", []):
                        if self._normalise_url(link) not in visited:
                            all_internal_urls.add(link)

                if all_internal_urls:
                    broken = await self._check_broken_links(list(all_internal_urls), client)
                    all_broken_links.extend(broken)

            # -- Compute category scores ---
            findings = self._aggregate_findings(all_page_analyses, all_broken_links)
            scores = self._compute_category_scores(findings, len(visited))

            audit.meta_score = scores["meta"]
            audit.headings_score = scores["headings"]
            audit.links_score = scores["links"]
            audit.images_score = scores["images"]
            audit.performance_score = scores["performance"]

            # Weighted overall: meta 25%, headings 15%, links 25%, images 15%, performance 20%
            audit.overall_score = round(
                scores["meta"] * 0.25
                + scores["headings"] * 0.15
                + scores["links"] * 0.25
                + scores["images"] * 0.15
                + scores["performance"] * 0.20
            )

            audit.findings = findings
            audit.recommendations = self._generate_recommendations(findings)
            audit.pages_crawled = len(visited)
            audit.status = "completed"
            audit.completed_at = datetime.now(timezone.utc)
            audit.duration_seconds = round(time.monotonic() - start_time, 2)

            await self.db.commit()
            await self.db.refresh(audit)

            logger.info(
                f"Audit {audit_id} completed: score={audit.overall_score}, "
                f"pages={audit.pages_crawled}, duration={audit.duration_seconds}s"
            )

        except Exception as exc:
            logger.exception(f"Audit {audit_id} failed: {exc}")
            audit.status = "failed"
            audit.error_message = str(exc)[:2000]
            audit.duration_seconds = round(time.monotonic() - start_time, 2)
            await self.db.commit()
            await self.db.refresh(audit)

        return audit

    # =========================================================================
    # PAGE ANALYSIS
    # =========================================================================

    def _analyze_page(self, url: str, response: httpx.Response) -> dict:
        """Parse HTML and evaluate on-page SEO factors."""
        html = response.text
        soup = BeautifulSoup(html, "html.parser")
        issues: list[dict] = []

        # --- Title ---
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else None

        if not title:
            issues.append({
                "type": "missing_title",
                "severity": "critical",
                "detail": "Page is missing a <title> tag.",
            })
        elif len(title) < 30:
            issues.append({
                "type": "title_too_short",
                "severity": "important",
                "detail": f"Title is only {len(title)} characters (recommended 30-60).",
            })
        elif len(title) > 60:
            issues.append({
                "type": "title_too_long",
                "severity": "important",
                "detail": f"Title is {len(title)} characters (recommended 30-60).",
            })

        # --- Meta description ---
        meta_tag = soup.find("meta", attrs={"name": "description"})
        meta_description = meta_tag.get("content", "").strip() if meta_tag else None

        if not meta_description:
            issues.append({
                "type": "missing_meta_description",
                "severity": "critical",
                "detail": "Page is missing a meta description.",
            })
        elif len(meta_description) < 120:
            issues.append({
                "type": "meta_description_too_short",
                "severity": "important",
                "detail": f"Meta description is only {len(meta_description)} characters (recommended 120-160).",
            })
        elif len(meta_description) > 160:
            issues.append({
                "type": "meta_description_too_long",
                "severity": "info",
                "detail": f"Meta description is {len(meta_description)} characters (recommended 120-160).",
            })

        # --- H1 ---
        h1_tags = soup.find_all("h1")
        h1_text = h1_tags[0].get_text(strip=True) if h1_tags else None

        if len(h1_tags) == 0:
            issues.append({
                "type": "missing_h1",
                "severity": "critical",
                "detail": "Page is missing an <h1> heading.",
            })
        elif len(h1_tags) > 1:
            issues.append({
                "type": "multiple_h1",
                "severity": "important",
                "detail": f"Page has {len(h1_tags)} <h1> tags (should have exactly one).",
            })

        # --- Word count ---
        body = soup.find("body")
        body_text = body.get_text(separator=" ", strip=True) if body else ""
        word_count = len(body_text.split())

        if word_count < 300:
            issues.append({
                "type": "thin_content",
                "severity": "important",
                "detail": f"Page has only {word_count} words (minimum recommended: 300).",
            })

        # --- Images ---
        images = soup.find_all("img")
        images_without_alt = [
            img.get("src", "unknown")
            for img in images
            if not img.get("alt", "").strip()
        ]
        total_images = len(images)
        missing_alt_count = len(images_without_alt)

        if missing_alt_count > 0:
            issues.append({
                "type": "images_missing_alt",
                "severity": "important",
                "detail": f"{missing_alt_count} of {total_images} images are missing alt text.",
            })

        # --- Performance hints ---
        page_size_kb = len(response.content) / 1024
        load_time_ms = response.elapsed.total_seconds() * 1000

        if page_size_kb > 3000:
            issues.append({
                "type": "large_page",
                "severity": "important",
                "detail": f"Page size is {page_size_kb:.0f}KB (recommended under 3000KB).",
            })

        if load_time_ms > 3000:
            issues.append({
                "type": "slow_page",
                "severity": "important",
                "detail": f"Page load time is {load_time_ms:.0f}ms (recommended under 3000ms).",
            })

        # --- Canonical ---
        canonical = soup.find("link", attrs={"rel": "canonical"})
        if not canonical:
            issues.append({
                "type": "missing_canonical",
                "severity": "info",
                "detail": "Page is missing a canonical link tag.",
            })

        # --- Score (100 minus deductions) ---
        deductions = 0
        for issue in issues:
            if issue["severity"] == "critical":
                deductions += 15
            elif issue["severity"] == "important":
                deductions += 8
            else:
                deductions += 3
        score = max(0, 100 - deductions)

        # Extract internal links for the BFS queue
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc
        internal_links = list(self._extract_links(html, url, domain))

        return {
            "url": url,
            "status_code": response.status_code,
            "title": title,
            "meta_description": meta_description,
            "h1": h1_text,
            "word_count": word_count,
            "total_images": total_images,
            "missing_alt_count": missing_alt_count,
            "page_size_kb": round(page_size_kb, 2),
            "load_time_ms": round(load_time_ms, 2),
            "has_canonical": canonical is not None,
            "internal_links": internal_links,
            "issues": issues,
            "score": score,
        }

    # =========================================================================
    # LINK HELPERS
    # =========================================================================

    def _extract_links(self, html: str, base_url: str, domain: str) -> set[str]:
        """Parse internal links from anchor tags, filtered to same domain."""
        soup = BeautifulSoup(html, "html.parser")
        links: set[str] = set()

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"].strip()

            # Skip fragments, javascript, mailto, tel
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue

            # Resolve relative URLs
            absolute = urllib.parse.urljoin(base_url, href)
            parsed = urllib.parse.urlparse(absolute)

            # Only keep same-domain links with http(s) scheme
            if parsed.scheme not in ("http", "https"):
                continue
            if parsed.netloc != domain:
                continue

            # Strip fragment, keep path+query
            clean = urllib.parse.urlunparse((
                parsed.scheme,
                parsed.netloc,
                parsed.path,
                parsed.params,
                parsed.query,
                "",  # no fragment
            ))
            links.add(clean)

        return links

    async def _check_broken_links(
        self,
        urls: list[str],
        client: httpx.AsyncClient | None = None,
    ) -> list[str]:
        """HEAD-request each URL to find broken links. Uses semaphore(10)."""
        broken: list[str] = []
        semaphore = asyncio.Semaphore(10)

        own_client = client is None
        if own_client:
            client = httpx.AsyncClient(
                timeout=5.0,
                follow_redirects=True,
                headers={"User-Agent": "AexyBot/1.0 (Link Checker)"},
            )

        async def check_one(url: str) -> None:
            async with semaphore:
                try:
                    resp = await client.head(url)
                    if resp.status_code >= 400:
                        broken.append(url)
                except httpx.HTTPError:
                    broken.append(url)

        try:
            await asyncio.gather(*(check_one(u) for u in urls))
        finally:
            if own_client:
                await client.aclose()

        return broken

    # =========================================================================
    # SCORING & RECOMMENDATIONS
    # =========================================================================

    def _aggregate_findings(
        self,
        page_analyses: list[dict],
        broken_links: list[str],
    ) -> dict:
        """Aggregate per-page analyses into a findings summary dict."""
        total = len(page_analyses) or 1

        missing_titles = sum(1 for p in page_analyses if not p.get("title"))
        short_titles = sum(
            1 for p in page_analyses
            if p.get("title") and len(p["title"]) < 30
        )
        long_titles = sum(
            1 for p in page_analyses
            if p.get("title") and len(p["title"]) > 60
        )
        missing_meta = sum(1 for p in page_analyses if not p.get("meta_description"))
        short_meta = sum(
            1 for p in page_analyses
            if p.get("meta_description") and len(p["meta_description"]) < 120
        )
        long_meta = sum(
            1 for p in page_analyses
            if p.get("meta_description") and len(p["meta_description"]) > 160
        )
        missing_h1 = sum(1 for p in page_analyses if not p.get("h1"))
        multiple_h1 = sum(
            1 for p in page_analyses
            for iss in p.get("issues", [])
            if iss["type"] == "multiple_h1"
        )
        thin_content = sum(1 for p in page_analyses if p.get("word_count", 0) < 300)

        total_images = sum(p.get("total_images", 0) for p in page_analyses)
        missing_alt = sum(p.get("missing_alt_count", 0) for p in page_analyses)
        missing_canonical = sum(
            1 for p in page_analyses if not p.get("has_canonical")
        )

        avg_load_ms = (
            sum(p.get("load_time_ms", 0) for p in page_analyses) / total
        )
        slow_pages = sum(
            1 for p in page_analyses if p.get("load_time_ms", 0) > 3000
        )
        large_pages = sum(
            1 for p in page_analyses if p.get("page_size_kb", 0) > 3000
        )

        return {
            "total_pages": total,
            "missing_titles": missing_titles,
            "short_titles": short_titles,
            "long_titles": long_titles,
            "missing_meta_descriptions": missing_meta,
            "short_meta_descriptions": short_meta,
            "long_meta_descriptions": long_meta,
            "missing_h1": missing_h1,
            "multiple_h1": multiple_h1,
            "thin_content_pages": thin_content,
            "total_images": total_images,
            "images_missing_alt": missing_alt,
            "missing_canonical": missing_canonical,
            "broken_links": broken_links,
            "broken_link_count": len(broken_links),
            "avg_load_time_ms": round(avg_load_ms, 2),
            "slow_pages": slow_pages,
            "large_pages": large_pages,
        }

    def _compute_category_scores(self, findings: dict, pages_crawled: int) -> dict:
        """Compute 0-100 scores for each SEO category."""
        total = findings.get("total_pages", 1) or 1

        # --- Meta score (title + meta description) ---
        title_issues = (
            findings["missing_titles"]
            + findings["short_titles"]
            + findings["long_titles"]
        )
        meta_issues = (
            findings["missing_meta_descriptions"]
            + findings["short_meta_descriptions"]
            + findings["long_meta_descriptions"]
        )
        # Critical missing items weighted higher
        title_deduct = (findings["missing_titles"] * 20 + findings["short_titles"] * 8 + findings["long_titles"] * 5)
        meta_deduct = (findings["missing_meta_descriptions"] * 15 + findings["short_meta_descriptions"] * 5 + findings["long_meta_descriptions"] * 3)
        meta_score = max(0, 100 - int((title_deduct + meta_deduct) / total))

        # --- Headings score ---
        heading_deduct = (findings["missing_h1"] * 20 + findings["multiple_h1"] * 10 + findings["thin_content_pages"] * 8)
        headings_score = max(0, 100 - int(heading_deduct / total))

        # --- Links score ---
        broken_penalty = min(60, findings["broken_link_count"] * 10)
        canonical_penalty = min(30, int((findings["missing_canonical"] / total) * 30))
        links_score = max(0, 100 - broken_penalty - canonical_penalty)

        # --- Images score ---
        if findings["total_images"] > 0:
            alt_ratio = findings["images_missing_alt"] / findings["total_images"]
            images_score = max(0, round(100 * (1 - alt_ratio)))
        else:
            # No images found — not an issue per se
            images_score = 100

        # --- Performance score ---
        perf_deduct = findings["slow_pages"] * 15 + findings["large_pages"] * 10
        performance_score = max(0, 100 - int(perf_deduct / total))

        return {
            "meta": meta_score,
            "headings": headings_score,
            "links": links_score,
            "images": images_score,
            "performance": performance_score,
        }

    def _generate_recommendations(self, findings: dict) -> list[dict]:
        """Generate deterministic recommendations based on aggregated findings."""
        recs: list[dict] = []
        total = findings.get("total_pages", 1) or 1

        # --- Critical ---
        if findings["missing_titles"] > 0:
            recs.append({
                "severity": "critical",
                "category": "meta",
                "message": (
                    f"{findings['missing_titles']} page(s) are missing a <title> tag. "
                    "Add unique, descriptive titles to improve click-through rates."
                ),
            })

        if findings["missing_meta_descriptions"] > 0:
            recs.append({
                "severity": "critical",
                "category": "meta",
                "message": (
                    f"{findings['missing_meta_descriptions']} page(s) are missing a meta description. "
                    "Write compelling descriptions between 120-160 characters."
                ),
            })

        if findings["missing_h1"] > 0:
            recs.append({
                "severity": "critical",
                "category": "headings",
                "message": (
                    f"{findings['missing_h1']} page(s) are missing an <h1> heading. "
                    "Each page should have exactly one H1 that describes its main topic."
                ),
            })

        if findings["broken_link_count"] > 0:
            recs.append({
                "severity": "critical",
                "category": "links",
                "message": (
                    f"{findings['broken_link_count']} broken link(s) detected. "
                    "Fix or remove broken links to improve user experience and crawlability."
                ),
            })

        # --- Important ---
        if findings["short_titles"] > 0:
            recs.append({
                "severity": "important",
                "category": "meta",
                "message": (
                    f"{findings['short_titles']} page(s) have titles shorter than 30 characters. "
                    "Expand titles to 30-60 characters for better search visibility."
                ),
            })

        if findings["long_titles"] > 0:
            recs.append({
                "severity": "important",
                "category": "meta",
                "message": (
                    f"{findings['long_titles']} page(s) have titles longer than 60 characters. "
                    "Shorten titles to prevent truncation in search results."
                ),
            })

        if findings["multiple_h1"] > 0:
            recs.append({
                "severity": "important",
                "category": "headings",
                "message": (
                    f"{findings['multiple_h1']} page(s) have multiple <h1> tags. "
                    "Use a single H1 per page and use H2-H6 for subsections."
                ),
            })

        if findings["thin_content_pages"] > 0:
            recs.append({
                "severity": "important",
                "category": "headings",
                "message": (
                    f"{findings['thin_content_pages']} page(s) have fewer than 300 words. "
                    "Add substantive content to improve topical authority."
                ),
            })

        if findings["images_missing_alt"] > 0:
            recs.append({
                "severity": "important",
                "category": "images",
                "message": (
                    f"{findings['images_missing_alt']} image(s) are missing alt text. "
                    "Add descriptive alt attributes for accessibility and image search."
                ),
            })

        if findings["slow_pages"] > 0:
            recs.append({
                "severity": "important",
                "category": "performance",
                "message": (
                    f"{findings['slow_pages']} page(s) load in over 3 seconds. "
                    "Optimize server response time, compress assets, and leverage caching."
                ),
            })

        if findings["large_pages"] > 0:
            recs.append({
                "severity": "important",
                "category": "performance",
                "message": (
                    f"{findings['large_pages']} page(s) exceed 3MB in size. "
                    "Reduce page weight by compressing images and minifying CSS/JS."
                ),
            })

        # --- Info ---
        if findings["short_meta_descriptions"] > 0:
            recs.append({
                "severity": "info",
                "category": "meta",
                "message": (
                    f"{findings['short_meta_descriptions']} page(s) have meta descriptions "
                    "shorter than 120 characters. Expand to 120-160 characters for full display in SERPs."
                ),
            })

        if findings["long_meta_descriptions"] > 0:
            recs.append({
                "severity": "info",
                "category": "meta",
                "message": (
                    f"{findings['long_meta_descriptions']} page(s) have meta descriptions "
                    "longer than 160 characters. They may be truncated in search results."
                ),
            })

        if findings["missing_canonical"] > 0:
            recs.append({
                "severity": "info",
                "category": "links",
                "message": (
                    f"{findings['missing_canonical']} page(s) are missing a canonical link tag. "
                    "Add canonical tags to prevent duplicate content issues."
                ),
            })

        return recs

    # =========================================================================
    # QUERY METHODS
    # =========================================================================

    async def list_audits(
        self,
        workspace_id: str,
        page: int = 1,
        per_page: int = 50,
    ) -> dict:
        """List audits for a workspace, paginated and ordered by created_at desc."""
        offset = (page - 1) * per_page

        count_stmt = (
            select(func.count())
            .select_from(SEOAudit)
            .where(SEOAudit.workspace_id == workspace_id)
        )
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        stmt = (
            select(SEOAudit)
            .where(SEOAudit.workspace_id == workspace_id)
            .order_by(SEOAudit.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        result = await self.db.execute(stmt)
        audits = list(result.scalars().all())

        return {
            "items": audits,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if total > 0 else 0,
        }

    async def get_audit(self, workspace_id: str, audit_id: str) -> SEOAudit | None:
        """Get a single audit by workspace and audit ID."""
        stmt = select(SEOAudit).where(
            and_(
                SEOAudit.id == audit_id,
                SEOAudit.workspace_id == workspace_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_audit_pages(self, audit_id: str) -> list[SEOAuditPage]:
        """Get all pages analysed within an audit."""
        stmt = (
            select(SEOAuditPage)
            .where(SEOAuditPage.audit_id == audit_id)
            .order_by(SEOAuditPage.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_score_history(
        self,
        workspace_id: str,
        domain: str,
    ) -> list[dict]:
        """Return score history for completed audits on a domain."""
        stmt = (
            select(
                SEOAudit.id,
                SEOAudit.overall_score,
                SEOAudit.created_at,
            )
            .where(
                and_(
                    SEOAudit.workspace_id == workspace_id,
                    SEOAudit.domain == domain,
                    SEOAudit.status == "completed",
                )
            )
            .order_by(SEOAudit.created_at.asc())
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        return [
            {
                "audit_id": row.id,
                "overall_score": row.overall_score,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]

    async def delete_audit(self, workspace_id: str, audit_id: str) -> bool:
        """Delete an audit and its associated pages."""
        # Verify audit belongs to workspace
        audit = await self.get_audit(workspace_id, audit_id)
        if audit is None:
            return False

        # Delete pages first (cascade should handle this, but be explicit)
        await self.db.execute(
            delete(SEOAuditPage).where(SEOAuditPage.audit_id == audit_id)
        )
        await self.db.execute(
            delete(SEOAudit).where(SEOAudit.id == audit_id)
        )
        await self.db.commit()

        logger.info(f"Deleted SEO audit {audit_id}")
        return True

    # =========================================================================
    # INTERNAL UTILITIES
    # =========================================================================

    @staticmethod
    def _normalise_url(url: str) -> str:
        """Normalise a URL for de-duplication (lowercase host, strip trailing slash)."""
        parsed = urllib.parse.urlparse(url)
        path = parsed.path.rstrip("/") or "/"
        return urllib.parse.urlunparse((
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            parsed.params,
            parsed.query,
            "",
        ))
