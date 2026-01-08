# Database Schema

## Overview

Aexy uses PostgreSQL with SQLAlchemy ORM. The schema is organized into logical domains representing different aspects of the system.

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Core Entities                                   │
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐              │
│  │  Developer   │──────│    Team      │──────│ Organization │              │
│  └──────┬───────┘      └──────────────┘      └──────────────┘              │
│         │                                                                   │
│         ├─────────────────┬─────────────────┬─────────────────┐            │
│         ▼                 ▼                 ▼                 ▼            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Commit     │  │ PullRequest  │  │  CodeReview  │  │    Issue     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Career Entities                                 │
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐              │
│  │ CareerRole   │──────│ LearningPath │──────│  Milestone   │              │
│  └──────────────┘      └──────┬───────┘      └──────────────┘              │
│                               │                                             │
│                               ▼                                             │
│                        ┌──────────────┐                                     │
│                        │   Activity   │                                     │
│                        └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            Analytics Entities                                │
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐              │
│  │ CustomReport │──────│ScheduledRep │      │  ExportJob   │              │
│  └──────────────┘      └──────────────┘      └──────────────┘              │
│                                                                             │
│  ┌──────────────┐                                                           │
│  │  Predictive  │                                                           │
│  │   Insight    │                                                           │
│  └──────────────┘                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          Integration Entities                                │
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐                                     │
│  │    Slack     │──────│ Notification │                                     │
│  │ Integration  │      │     Log      │                                     │
│  └──────────────┘      └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Models

### Developer

Primary entity representing a tracked developer.

```sql
CREATE TABLE developers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    github_username VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    location VARCHAR(255),
    company VARCHAR(255),

    -- Profile data (JSONB for flexibility)
    skills TEXT[] DEFAULT '{}',
    languages JSONB DEFAULT '{}',  -- {python: {lines: 10000, commits: 50}}
    frameworks JSONB DEFAULT '{}',
    domains JSONB DEFAULT '{}',

    -- Computed scores
    seniority_level VARCHAR(50),
    seniority_score INTEGER,

    -- Timestamps
    github_created_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    profile_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_developers_github_username ON developers(github_username);
CREATE INDEX idx_developers_skills ON developers USING GIN(skills);
```

### Team

Group of developers with shared analytics.

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    organization_id UUID,

    -- Members (denormalized for performance)
    developer_ids UUID[] DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_teams_developer_ids ON teams USING GIN(developer_ids);
```

### Commit

Individual git commits from developers.

```sql
CREATE TABLE commits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sha VARCHAR(40) UNIQUE NOT NULL,
    developer_id UUID REFERENCES developers(id),
    repository_name VARCHAR(255) NOT NULL,
    repository_full_name VARCHAR(255),

    message TEXT,

    -- Stats
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,

    -- Extracted data (JSONB)
    files JSONB DEFAULT '[]',  -- [{path, additions, deletions, language}]
    languages JSONB DEFAULT '{}',

    committed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_commits_developer_id ON commits(developer_id);
CREATE INDEX idx_commits_committed_at ON commits(committed_at);
```

### PullRequest

Pull requests authored by developers.

```sql
CREATE TABLE pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    number INTEGER NOT NULL,
    developer_id UUID REFERENCES developers(id),
    repository_name VARCHAR(255) NOT NULL,

    title TEXT,
    body TEXT,
    state VARCHAR(20),  -- open, closed, merged

    -- Stats
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    changed_files INTEGER DEFAULT 0,
    commits_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    review_comments_count INTEGER DEFAULT 0,

    -- Timing
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    merged_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    labels JSONB DEFAULT '[]',
    reviewers JSONB DEFAULT '[]'
);

CREATE INDEX idx_pull_requests_developer_id ON pull_requests(developer_id);
CREATE INDEX idx_pull_requests_state ON pull_requests(state);
```

### CodeReview

Code reviews performed by developers.

```sql
CREATE TABLE code_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    pull_request_id UUID REFERENCES pull_requests(id),
    reviewer_id UUID REFERENCES developers(id),

    state VARCHAR(50),  -- approved, changes_requested, commented
    body TEXT,

    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_code_reviews_reviewer_id ON code_reviews(reviewer_id);
CREATE INDEX idx_code_reviews_pull_request_id ON code_reviews(pull_request_id);
```

## Career Models

### CareerRole

Predefined career levels and target roles.

```sql
CREATE TABLE career_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    level INTEGER NOT NULL,  -- 1=Junior, 2=Mid, etc.

    -- Requirements (JSONB)
    required_skills JSONB DEFAULT '{}',  -- {python: 70, system_design: 50}
    optional_skills JSONB DEFAULT '{}',
    experience_years_min INTEGER,

    description TEXT,
    responsibilities TEXT[],

    is_custom BOOLEAN DEFAULT FALSE,
    organization_id UUID,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### LearningPath

Developer learning paths toward career goals.

```sql
CREATE TABLE learning_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID REFERENCES developers(id),
    target_role_id UUID REFERENCES career_roles(id),

    status VARCHAR(50) DEFAULT 'active',  -- active, completed, paused

    -- Progress (JSONB)
    skill_gaps JSONB DEFAULT '[]',
    recommended_activities JSONB DEFAULT '[]',

    -- Timing
    estimated_months INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    target_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_learning_paths_developer_id ON learning_paths(developer_id);
```

### LearningMilestone

Milestones within a learning path.

```sql
CREATE TABLE learning_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_path_id UUID REFERENCES learning_paths(id),

    title VARCHAR(255) NOT NULL,
    description TEXT,
    skill VARCHAR(100),
    target_level INTEGER,

    status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, completed
    progress_percentage INTEGER DEFAULT 0,

    -- Timing
    target_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_learning_milestones_learning_path_id ON learning_milestones(learning_path_id);
```

## Analytics Models

### CustomReport

User-created custom reports.

```sql
CREATE TABLE custom_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES developers(id),
    organization_id UUID,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Configuration (JSONB)
    widgets JSONB DEFAULT '[]',  -- [{type, metric, config, position}]
    filters JSONB DEFAULT '{}',  -- {date_range, team_ids, developer_ids}
    layout JSONB DEFAULT '{}',   -- {columns, rows}

    is_template BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_custom_reports_creator_id ON custom_reports(creator_id);
```

### ScheduledReport

Scheduled report deliveries.

```sql
CREATE TABLE scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES custom_reports(id),

    schedule VARCHAR(50) NOT NULL,  -- daily, weekly, monthly
    day_of_week INTEGER,  -- 0-6 for weekly
    day_of_month INTEGER, -- 1-31 for monthly
    time_utc VARCHAR(5),  -- "09:00"

    recipients TEXT[] DEFAULT '{}',
    delivery_method VARCHAR(50),  -- email, slack, both
    export_format VARCHAR(20),    -- pdf, csv, json

    is_active BOOLEAN DEFAULT TRUE,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### ExportJob

Background export job tracking.

```sql
CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by UUID REFERENCES developers(id),

    export_type VARCHAR(100) NOT NULL,
    format VARCHAR(20) NOT NULL,
    config JSONB DEFAULT '{}',

    status VARCHAR(50) DEFAULT 'pending',  -- pending, processing, completed, failed
    file_path TEXT,
    file_size_bytes BIGINT,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_export_jobs_requested_by ON export_jobs(requested_by);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
```

### PredictiveInsight

Cached LLM-generated predictions.

```sql
CREATE TABLE predictive_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID REFERENCES developers(id),
    team_id UUID REFERENCES teams(id),

    insight_type VARCHAR(100) NOT NULL,  -- attrition_risk, burnout_risk, etc.

    -- LLM Analysis (JSONB)
    risk_score FLOAT,
    confidence FLOAT,
    factors JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',

    -- Metadata
    data_window_days INTEGER,
    generated_by_model VARCHAR(100),

    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_predictive_insights_developer_id ON predictive_insights(developer_id);
CREATE INDEX idx_predictive_insights_type ON predictive_insights(insight_type);
```

## Integration Models

### SlackIntegration

Slack workspace connections.

```sql
CREATE TABLE slack_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,

    team_id VARCHAR(50) UNIQUE NOT NULL,  -- Slack team ID
    team_name VARCHAR(255),
    bot_token TEXT NOT NULL,  -- Encrypted
    bot_user_id VARCHAR(50),

    app_id VARCHAR(50),
    scope TEXT,

    default_channel_id VARCHAR(50),
    notification_settings JSONB DEFAULT '{}',
    user_mappings JSONB DEFAULT '{}',  -- {slack_user_id: developer_id}

    is_active BOOLEAN DEFAULT TRUE,
    installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    installed_by UUID REFERENCES developers(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_slack_integrations_team_id ON slack_integrations(team_id);
```

### SlackNotificationLog

Audit log for Slack notifications.

```sql
CREATE TABLE slack_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES slack_integrations(id),

    channel_id VARCHAR(50),
    message_ts VARCHAR(50),

    notification_type VARCHAR(50),
    content_summary TEXT,

    status VARCHAR(20),  -- sent, failed, pending
    error_message TEXT,

    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_slack_notification_logs_integration_id ON slack_notification_logs(integration_id);
```

## Indexes & Performance

### Recommended Indexes

```sql
-- Composite indexes for common queries
CREATE INDEX idx_commits_developer_date ON commits(developer_id, committed_at DESC);
CREATE INDEX idx_pull_requests_developer_state ON pull_requests(developer_id, state);
CREATE INDEX idx_code_reviews_reviewer_date ON code_reviews(reviewer_id, submitted_at DESC);

-- Partial indexes for active records
CREATE INDEX idx_learning_paths_active ON learning_paths(developer_id)
    WHERE status = 'active';
CREATE INDEX idx_export_jobs_pending ON export_jobs(created_at)
    WHERE status IN ('pending', 'processing');

-- Full-text search
CREATE INDEX idx_developers_search ON developers
    USING GIN(to_tsvector('english', name || ' ' || COALESCE(bio, '')));
```

## Migration Strategy

1. Use Alembic for version-controlled migrations
2. Always create migrations for schema changes
3. Test migrations on staging before production
4. Include rollback migrations for critical changes
5. Use transactions for multi-table changes
