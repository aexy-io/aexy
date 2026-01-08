"""External course provider service for searching and importing courses."""

import logging
import re
from typing import Any

import httpx

from aexy.core.config import get_settings
from aexy.schemas.external_course import ExternalCourse

logger = logging.getLogger(__name__)
settings = get_settings()


class CourseProviderService:
    """Service for searching external course providers."""

    # YouTube Data API v3 endpoint
    YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
    YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

    def __init__(self) -> None:
        """Initialize the course provider service."""
        self.youtube_api_key = getattr(settings, "YOUTUBE_API_KEY", None)

    async def search_courses(
        self,
        skill_name: str,
        providers: list[str] | None = None,
        max_results: int = 10,
    ) -> list[ExternalCourse]:
        """Search for courses across multiple providers.

        Args:
            skill_name: Skill or topic to search for.
            providers: List of providers to search (default: ["youtube"]).
            max_results: Maximum number of results per provider.

        Returns:
            List of external courses.
        """
        if providers is None:
            providers = ["youtube"]

        all_courses: list[ExternalCourse] = []

        for provider in providers:
            try:
                if provider == "youtube":
                    courses = await self.search_youtube(skill_name, max_results)
                    all_courses.extend(courses)
                # Add other providers here as they're implemented
                # elif provider == "coursera":
                #     courses = await self.search_coursera(skill_name, max_results)
                #     all_courses.extend(courses)
            except Exception as e:
                logger.error(f"Error searching {provider}: {e}")

        return all_courses

    async def search_youtube(
        self,
        skill_name: str,
        max_results: int = 10,
    ) -> list[ExternalCourse]:
        """Search YouTube for tutorial videos.

        Args:
            skill_name: Skill or topic to search for.
            max_results: Maximum number of results.

        Returns:
            List of external courses from YouTube.
        """
        if not self.youtube_api_key:
            logger.warning("YouTube API key not configured, using mock data")
            return self._get_mock_youtube_results(skill_name, max_results)

        try:
            async with httpx.AsyncClient() as client:
                # Search for videos
                search_params = {
                    "part": "snippet",
                    "q": f"{skill_name} tutorial",
                    "type": "video",
                    "maxResults": max_results,
                    "order": "relevance",
                    "videoDuration": "medium",  # 4-20 minutes
                    "key": self.youtube_api_key,
                }

                response = await client.get(
                    self.YOUTUBE_SEARCH_URL,
                    params=search_params,
                    timeout=10.0,
                )
                response.raise_for_status()
                search_data = response.json()

                if "items" not in search_data:
                    return []

                # Get video IDs for duration info
                video_ids = [
                    item["id"]["videoId"]
                    for item in search_data["items"]
                    if "videoId" in item.get("id", {})
                ]

                # Get video details (duration, view count, etc.)
                video_details = {}
                if video_ids:
                    details_params = {
                        "part": "contentDetails,statistics",
                        "id": ",".join(video_ids),
                        "key": self.youtube_api_key,
                    }
                    details_response = await client.get(
                        self.YOUTUBE_VIDEOS_URL,
                        params=details_params,
                        timeout=10.0,
                    )
                    if details_response.status_code == 200:
                        details_data = details_response.json()
                        for item in details_data.get("items", []):
                            video_details[item["id"]] = item

                # Convert to ExternalCourse objects
                courses = []
                for item in search_data["items"]:
                    video_id = item.get("id", {}).get("videoId")
                    if not video_id:
                        continue

                    snippet = item.get("snippet", {})
                    details = video_details.get(video_id, {})

                    # Parse duration
                    duration_minutes = None
                    if "contentDetails" in details:
                        duration_str = details["contentDetails"].get("duration", "")
                        duration_minutes = self._parse_youtube_duration(duration_str)

                    # Get thumbnail (prefer medium quality)
                    thumbnails = snippet.get("thumbnails", {})
                    thumbnail_url = (
                        thumbnails.get("medium", {}).get("url")
                        or thumbnails.get("default", {}).get("url")
                    )

                    course = ExternalCourse(
                        provider="youtube",
                        external_id=video_id,
                        title=snippet.get("title", ""),
                        description=snippet.get("description", "")[:500] if snippet.get("description") else None,
                        url=f"https://www.youtube.com/watch?v={video_id}",
                        thumbnail_url=thumbnail_url,
                        instructor=snippet.get("channelTitle"),
                        duration_minutes=duration_minutes,
                        rating=None,  # YouTube doesn't provide direct ratings
                        review_count=None,
                        price=None,
                        is_free=True,
                        skill_tags=[skill_name],
                        difficulty=None,
                    )
                    courses.append(course)

                return courses

        except httpx.HTTPError as e:
            logger.error(f"HTTP error searching YouTube: {e}")
            return self._get_mock_youtube_results(skill_name, max_results)
        except Exception as e:
            logger.error(f"Error searching YouTube: {e}")
            return self._get_mock_youtube_results(skill_name, max_results)

    def _parse_youtube_duration(self, duration_str: str) -> int | None:
        """Parse YouTube ISO 8601 duration to minutes.

        Args:
            duration_str: Duration in ISO 8601 format (e.g., "PT1H30M45S").

        Returns:
            Duration in minutes or None if parsing fails.
        """
        if not duration_str:
            return None

        # Parse ISO 8601 duration: PT#H#M#S
        match = re.match(
            r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?",
            duration_str,
        )
        if not match:
            return None

        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)

        total_minutes = hours * 60 + minutes + (1 if seconds >= 30 else 0)
        return total_minutes if total_minutes > 0 else 1

    def _get_mock_youtube_results(
        self,
        skill_name: str,
        max_results: int = 10,
    ) -> list[ExternalCourse]:
        """Get mock YouTube results when API is not available.

        Args:
            skill_name: Skill or topic searched for.
            max_results: Maximum number of results.

        Returns:
            List of mock courses.
        """
        mock_courses = [
            ExternalCourse(
                provider="youtube",
                external_id=f"mock_{skill_name}_{i}",
                title=f"{skill_name.title()} Tutorial - Part {i + 1}",
                description=f"Learn {skill_name} in this comprehensive tutorial. Perfect for beginners and intermediate developers.",
                url=f"https://www.youtube.com/watch?v=mock_{skill_name}_{i}",
                thumbnail_url="https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
                instructor=f"TechTutor {i + 1}",
                duration_minutes=15 + (i * 5),
                rating=4.5,
                review_count=1000 + (i * 100),
                price=None,
                is_free=True,
                skill_tags=[skill_name, "programming", "tutorial"],
                difficulty="beginner" if i < 3 else "intermediate",
            )
            for i in range(min(max_results, 5))
        ]
        return mock_courses

    async def search_coursera(
        self,
        skill_name: str,
        max_results: int = 10,
    ) -> list[ExternalCourse]:
        """Search Coursera for courses.

        Note: Requires COURSERA_API_KEY environment variable.
        Coursera Partner API requires a business partnership.
        See: https://www.coursera.org/business/partners

        Args:
            skill_name: Skill or topic to search for.
            max_results: Maximum number of results.

        Returns:
            List of external courses from Coursera.
        """
        import os

        api_key = os.getenv("COURSERA_API_KEY")
        if not api_key:
            logger.debug("Coursera API key not configured (COURSERA_API_KEY)")
            return []

        # TODO: Implement Coursera API integration when partnership is established
        # Coursera API docs: https://build.coursera.org/
        logger.info(f"Coursera search for '{skill_name}' - API integration pending")
        return []

    async def search_udemy(
        self,
        skill_name: str,
        max_results: int = 10,
    ) -> list[ExternalCourse]:
        """Search Udemy for courses.

        Note: Requires UDEMY_CLIENT_ID and UDEMY_CLIENT_SECRET environment variables.
        Udemy Affiliate API requires an affiliate account.
        See: https://www.udemy.com/developers/affiliate/

        Args:
            skill_name: Skill or topic to search for.
            max_results: Maximum number of results.

        Returns:
            List of external courses from Udemy.
        """
        import os

        client_id = os.getenv("UDEMY_CLIENT_ID")
        client_secret = os.getenv("UDEMY_CLIENT_SECRET")

        if not client_id or not client_secret:
            logger.debug("Udemy API credentials not configured (UDEMY_CLIENT_ID, UDEMY_CLIENT_SECRET)")
            return []

        # Udemy Affiliate API implementation
        try:
            import base64

            auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://www.udemy.com/api-2.0/courses/",
                    params={
                        "search": skill_name,
                        "page_size": max_results,
                        "ordering": "relevance",
                    },
                    headers={
                        "Authorization": f"Basic {auth}",
                        "Accept": "application/json",
                    },
                    timeout=10.0,
                )

                if response.status_code != 200:
                    logger.warning(f"Udemy API error: {response.status_code}")
                    return []

                data = response.json()
                courses = []

                for item in data.get("results", [])[:max_results]:
                    courses.append(
                        ExternalCourse(
                            provider="udemy",
                            external_id=str(item.get("id", "")),
                            title=item.get("title", ""),
                            description=item.get("headline", ""),
                            url=f"https://www.udemy.com{item.get('url', '')}",
                            thumbnail_url=item.get("image_240x135", ""),
                            instructor=item.get("visible_instructors", [{}])[0].get("display_name", ""),
                            duration_minutes=int(item.get("content_info_short", "0").split()[0] or 0) * 60,
                            rating=item.get("rating", 0),
                            review_count=item.get("num_reviews", 0),
                            price=item.get("price"),
                            is_free=item.get("is_paid", True) is False,
                            skill_tags=[skill_name],
                            difficulty="all",
                        )
                    )

                return courses

        except Exception as e:
            logger.error(f"Udemy search failed: {e}")
            return []

    async def search_pluralsight(
        self,
        skill_name: str,
        max_results: int = 10,
    ) -> list[ExternalCourse]:
        """Search Pluralsight for courses.

        Note: Requires PLURALSIGHT_API_KEY environment variable.
        Pluralsight API requires enterprise account.
        See: https://www.pluralsight.com/product/professional-services

        Args:
            skill_name: Skill or topic to search for.
            max_results: Maximum number of results.

        Returns:
            List of external courses from Pluralsight.
        """
        import os

        api_key = os.getenv("PLURALSIGHT_API_KEY")
        if not api_key:
            logger.debug("Pluralsight API key not configured (PLURALSIGHT_API_KEY)")
            return []

        # TODO: Implement Pluralsight API integration when enterprise access is available
        logger.info(f"Pluralsight search for '{skill_name}' - API integration pending")
        return []
