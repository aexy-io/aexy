"""Database models for Devograph."""

from devograph.models.plan import Plan, PlanTier, DEFAULT_PLANS
from devograph.models.developer import Developer, GitHubConnection, GitHubInstallation
from devograph.models.billing import (
    CustomerBilling,
    Subscription,
    UsageRecord,
    UsageAggregate,
    Invoice,
    SubscriptionStatus,
    UsageType,
)
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
    JiraIntegration,
    LinearIntegration,
)
from devograph.models.repository import (
    Organization,
    Repository,
    DeveloperRepository,
    DeveloperOrganization,
)
from devograph.models.workspace import (
    Workspace,
    WorkspaceMember,
    WorkspaceSubscription,
)
from devograph.models.team import (
    Team,
    TeamMember,
)
from devograph.models.sprint import (
    Sprint,
    SprintTask,
    SprintMetrics,
    TeamVelocity,
    SprintPlanningSession,
    SprintRetrospective,
    WorkspaceTaskStatus,
    WorkspaceCustomField,
    TaskGitHubLink,
    TaskActivity,
)
from devograph.models.epic import Epic
from devograph.models.learning_activity import (
    LearningActivityLog,
    LearningTimeSession,
)
from devograph.models.gamification import (
    DeveloperGamification,
    Badge,
    DeveloperBadge,
    PREDEFINED_BADGES,
)
from devograph.models.review import (
    ReviewCycle,
    IndividualReview,
    ReviewSubmission,
    ReviewRequest,
    WorkGoal,
    ContributionSummary,
)
from devograph.models.notification import (
    Notification,
    NotificationPreference,
    EmailNotificationLog,
    NotificationEventType,
    DEFAULT_NOTIFICATION_PREFERENCES,
)
from devograph.models.oncall import (
    OnCallConfig,
    OnCallSchedule,
    OnCallSwapRequest,
    GoogleCalendarToken,
    SwapRequestStatus,
)
from devograph.models.documentation import (
    Document,
    DocumentVersion,
    DocumentTemplate,
    DocumentCodeLink,
    DocumentGenerationPrompt,
    CollaborationSession,
    DocumentCollaborator,
    DocumentSyncQueue,
    DocumentStatus,
    DocumentLinkType,
    DocumentPermission,
    TemplateCategory,
    SYSTEM_TEMPLATES,
)
from devograph.models.tracking import (
    DeveloperStandup,
    WorkLog,
    TimeEntry,
    Blocker,
    SlackChannelConfig,
    DeveloperActivityPattern,
    StandupSummary,
    TrackingSource,
    BlockerSeverity,
    BlockerCategory,
    BlockerStatus,
    WorkLogType,
    ChannelType,
)
from devograph.models.ticketing import (
    TicketForm,
    TicketFormField,
    Ticket,
    TicketResponse,
    TicketMetrics,
    SLAPolicy,
    TicketFormAuthMode,
    TicketFormTemplateType,
    TicketStatus,
    TicketPriority,
    TicketFieldType,
)

__all__ = [
    # Plan
    "Plan",
    "PlanTier",
    "DEFAULT_PLANS",
    # Billing
    "CustomerBilling",
    "Subscription",
    "UsageRecord",
    "UsageAggregate",
    "Invoice",
    "SubscriptionStatus",
    "UsageType",
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
    "JiraIntegration",
    "LinearIntegration",
    # Repository
    "Organization",
    "Repository",
    "DeveloperRepository",
    "DeveloperOrganization",
    # Workspace
    "Workspace",
    "WorkspaceMember",
    "WorkspaceSubscription",
    # Team
    "Team",
    "TeamMember",
    # Sprint
    "Sprint",
    "SprintTask",
    "SprintMetrics",
    "TeamVelocity",
    "SprintPlanningSession",
    "SprintRetrospective",
    # Task Configuration
    "WorkspaceTaskStatus",
    "WorkspaceCustomField",
    "TaskGitHubLink",
    "TaskActivity",
    # Epic
    "Epic",
    # Learning Activity
    "LearningActivityLog",
    "LearningTimeSession",
    # Gamification
    "DeveloperGamification",
    "Badge",
    "DeveloperBadge",
    "PREDEFINED_BADGES",
    # Reviews
    "ReviewCycle",
    "IndividualReview",
    "ReviewSubmission",
    "ReviewRequest",
    "WorkGoal",
    "ContributionSummary",
    # Notifications
    "Notification",
    "NotificationPreference",
    "EmailNotificationLog",
    "NotificationEventType",
    "DEFAULT_NOTIFICATION_PREFERENCES",
    # On-Call
    "OnCallConfig",
    "OnCallSchedule",
    "OnCallSwapRequest",
    "GoogleCalendarToken",
    "SwapRequestStatus",
    # Documentation
    "Document",
    "DocumentVersion",
    "DocumentTemplate",
    "DocumentCodeLink",
    "DocumentGenerationPrompt",
    "CollaborationSession",
    "DocumentCollaborator",
    "DocumentSyncQueue",
    "DocumentStatus",
    "DocumentLinkType",
    "DocumentPermission",
    "TemplateCategory",
    "SYSTEM_TEMPLATES",
    # Tracking
    "DeveloperStandup",
    "WorkLog",
    "TimeEntry",
    "Blocker",
    "SlackChannelConfig",
    "DeveloperActivityPattern",
    "StandupSummary",
    "TrackingSource",
    "BlockerSeverity",
    "BlockerCategory",
    "BlockerStatus",
    "WorkLogType",
    "ChannelType",
    # Ticketing
    "TicketForm",
    "TicketFormField",
    "Ticket",
    "TicketResponse",
    "TicketMetrics",
    "SLAPolicy",
    "TicketFormAuthMode",
    "TicketFormTemplateType",
    "TicketStatus",
    "TicketPriority",
    "TicketFieldType",
]
