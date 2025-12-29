"""Database models for Gitraki."""

from gitraki.models.developer import Developer, GitHubConnection
from gitraki.models.activity import Commit, PullRequest, CodeReview
from gitraki.models.career import (
    CareerRole,
    LearningPath,
    LearningMilestone,
    HiringRequirement,
    OrganizationSettings,
)
from gitraki.models.analytics import (
    CustomReport,
    ScheduledReport,
    ExportJob,
    PredictiveInsight,
)
from gitraki.models.integrations import (
    SlackIntegration,
    SlackNotificationLog,
)

__all__ = [
    # Developer
    "Developer",
    "GitHubConnection",
    # Activity
    "Commit",
    "PullRequest",
    "CodeReview",
    # Career
    "CareerRole",
    "LearningPath",
    "LearningMilestone",
    "HiringRequirement",
    "OrganizationSettings",
    # Analytics (Phase 4)
    "CustomReport",
    "ScheduledReport",
    "ExportJob",
    "PredictiveInsight",
    # Integrations (Phase 4)
    "SlackIntegration",
    "SlackNotificationLog",
]
