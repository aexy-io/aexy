"""External course provider schemas."""

from pydantic import BaseModel, Field


class ExternalCourse(BaseModel):
    """External course from providers like YouTube, Coursera, etc."""

    provider: str  # "youtube", "coursera", "udemy", "pluralsight"
    external_id: str
    title: str
    description: str | None = None
    url: str
    thumbnail_url: str | None = None
    instructor: str | None = None
    duration_minutes: int | None = None
    rating: float | None = Field(default=None, ge=0, le=5)
    review_count: int | None = None
    price: float | None = None  # None for free
    is_free: bool = True
    skill_tags: list[str] = []
    difficulty: str | None = None  # "beginner", "intermediate", "advanced"


class CourseSearchRequest(BaseModel):
    """Request for searching courses."""

    skill_name: str
    providers: list[str] = ["youtube"]  # Default to YouTube (free API)
    max_results: int = Field(default=10, ge=1, le=50)


class CourseSearchResponse(BaseModel):
    """Response from course search."""

    courses: list[ExternalCourse]
    total_results: int
    providers_searched: list[str]


class CourseImportRequest(BaseModel):
    """Request to import a course as an activity."""

    course: ExternalCourse
    learning_path_id: str | None = None
    milestone_id: str | None = None


class YouTubeVideoInfo(BaseModel):
    """YouTube video information from API response."""

    video_id: str
    title: str
    description: str | None = None
    channel_title: str
    thumbnail_url: str | None = None
    duration_seconds: int | None = None
    view_count: int | None = None
    like_count: int | None = None
    published_at: str | None = None
