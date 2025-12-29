"""Database models for Devograph."""

from devograph.models.developer import Developer, GitHubConnection, GitHubInstallation
from devograph.models.activity import Commit, PullRequest, CodeReview
from devograph.models.career import (
    CareerRole,
    LearningPath,
    LearningMilestone,
    HiringRequirement,
    OrganizationSettings,
)
from devograph.models.analytics import (
    CustomReport,
    ScheduledReport,
    ExportJob,
    PredictiveInsight,
)
from devograph.models.integrations import (
    SlackIntegration,
    SlackNotificationLog,
)
from devograph.models.repository import (
    Organization,
    Repository,
    DeveloperRepository,
    DeveloperOrganization,
)

__all__ = [
    # Developer
    "Developer",
    "GitHubConnection",
    "GitHubInstallation",
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
    # Repository
    "Organization",
    "Repository",
    "DeveloperRepository",
    "DeveloperOrganization",
]
