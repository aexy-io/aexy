# PRD: Workflow Builder Improvements

**Document Version:** 1.0
**Created:** 2026-01-10
**Status:** In Progress
**Owner:** Engineering Team

---

## Executive Summary

The workflow builder is a visual automation tool that allows users to create complex workflows using a drag-and-drop interface. While the foundation is solid (React Flow canvas, 6 node types, 13 action handlers), several critical features are incomplete and UX improvements are needed to make it production-ready.

---

## Current Architecture

### Frontend Stack
- **Framework:** Next.js with React
- **Visual Canvas:** React Flow (XYFlow)
- **State Management:** React useState + useCallback
- **Location:** `frontend/src/components/workflow-builder/`

### Backend Stack
- **Framework:** FastAPI
- **Database:** PostgreSQL with SQLAlchemy (async)
- **Task Queue:** Celery with Redis
- **Location:** `backend/src/aexy/services/workflow_service.py`

### Node Types
| Node | Purpose | Status |
|------|---------|--------|
| TriggerNode | Entry point (record created, field changed, scheduled, webhook) | ✅ Complete |
| ActionNode | 13 action types (email, Slack, SMS, webhook, CRM operations) | ✅ Complete |
| ConditionNode | If/else branching with AND/OR logic | ✅ Complete |
| WaitNode | Delay execution (duration, datetime, event) | ⚠️ Partial |
| AgentNode | AI agent invocation | ⚠️ Stub Only |
| BranchNode | Multi-path splitting | ✅ Complete |

---

## Implementation Tracker

### Legend
- ⬜ Not Started
- 🟡 In Progress
- ✅ Complete
- ❌ Blocked

---

## Phase 1: Critical Fixes

These are blocking issues that prevent workflows from functioning correctly in production.

### 1.1 Wait Node Scheduling
**Priority:** P0 - Critical
**Status:** ✅ Complete
**Estimated Effort:** 3-4 days
**Completed:** 2026-01-10

**Problem:**
`_execute_wait()` in `workflow_service.py:450` returns metadata but doesn't actually schedule the workflow continuation. Workflows with wait nodes simply skip the wait.

**Requirements:**
- [x] Create `WorkflowExecution` model to persist execution state
- [x] Create `WorkflowExecutionStep` model for step-by-step tracking
- [x] Implement Celery Beat task to resume paused workflows
- [x] Handle duration waits (minutes, hours, days)
- [x] Handle datetime waits (specific date/time)
- [x] Add timeout handling for stalled executions
- [x] Resume execution from correct node after wait completes

**Technical Design:**
```python
# New model: WorkflowExecution
class WorkflowExecution(Base):
    id: UUID
    workflow_id: UUID
    automation_id: UUID
    record_id: UUID
    status: Enum['running', 'paused', 'completed', 'failed', 'cancelled']
    current_node_id: str
    context: JSONB  # execution context/variables
    started_at: datetime
    completed_at: datetime | None
    resume_at: datetime | None  # for wait nodes
    error: str | None
```

**Files to Modify:**
- `backend/src/aexy/models/workflow.py`
- `backend/src/aexy/services/workflow_service.py`
- `backend/src/aexy/processing/celery_app.py`
- New: `backend/src/aexy/processing/workflow_tasks.py`

---

### 1.2 Agent Node Execution
**Priority:** P0 - Critical
**Status:** ✅ Complete
**Estimated Effort:** 2-3 days
**Completed:** 2026-01-10

**Problem:**
`_execute_agent()` marks execution as "scheduled" but never invokes actual agents. The agent framework exists in `backend/src/aexy/agents/` but isn't wired up.

**Requirements:**
- [x] Connect AgentNode execution to AgentService
- [x] Apply input_mapping to prepare agent context
- [x] Invoke agent with mapped inputs
- [x] Capture agent output and apply output_mapping
- [x] Handle agent errors gracefully
- [x] Support async agent execution (queue to Celery)
- [x] Add timeout for long-running agents (via agent config)

**Prebuilt Agents Available:**
- `lead_scoring` - Score leads based on criteria
- `data_enrichment` - Enrich contact data
- `email_drafter` - AI-powered email composition
- `sales_outreach` - Generate outreach sequences

**Files to Modify:**
- `backend/src/aexy/services/workflow_service.py`
- `backend/src/aexy/services/agent_service.py`
- `backend/src/aexy/processing/workflow_tasks.py`

---

### 1.3 Execution History & Logging
**Priority:** P0 - Critical
**Status:** ✅ Complete
**Estimated Effort:** 3-4 days
**Completed:** 2026-01-10

**Problem:**
No persistence of execution results. Users can't debug failed workflows or audit past runs.

**Requirements:**
- [x] Create `WorkflowExecution` model (shared with 1.1)
- [x] Create `WorkflowExecutionStep` model for per-node results
- [x] Log execution start, each node result, and completion
- [x] Store execution context at each step
- [x] API endpoint to list executions for a workflow
- [x] API endpoint to get execution details with step breakdown
- [x] Frontend: Execution history panel in workflow editor
- [x] Frontend: Execution detail view with steps and node highlighting

**API Endpoints:**
```
GET /workspaces/{id}/crm/automations/{id}/workflow/executions
GET /workspaces/{id}/crm/automations/{id}/workflow/executions/{execution_id}
POST /workspaces/{id}/crm/automations/{id}/workflow/executions/{execution_id}/cancel
```

**Files to Modify:**
- `backend/src/aexy/models/workflow.py`
- `backend/src/aexy/schemas/workflow.py`
- `backend/src/aexy/api/workflows.py`
- `backend/src/aexy/services/workflow_service.py`
- `frontend/src/app/crm/automations/[automationId]/page.tsx`
- New: `frontend/src/components/workflow-builder/ExecutionHistory.tsx`

---

### 1.4 Event-Based Wait System
**Priority:** P1 - High
**Status:** ✅ Complete
**Estimated Effort:** 4-5 days
**Completed:** 2026-01-10

**Problem:**
Wait nodes support `wait_type: 'event'` (e.g., email.opened, form.submitted) but no event listener infrastructure exists.

**Requirements:**
- [x] Define supported event types and their schemas
- [x] Create event subscription table (workflow -> event type)
- [x] Webhook receiver for external events (email tracking, forms)
- [x] Event matching logic (match event to waiting workflows)
- [x] Resume workflow when matching event received
- [x] Timeout handling for events that never arrive
- [x] UI: Event type selector in wait node config

**Supported Events:**
| Event | Source | Data |
|-------|--------|------|
| `email.opened` | Email tracking pixel | email_id, opened_at |
| `email.clicked` | Link tracking | email_id, link_url, clicked_at |
| `email.replied` | Gmail webhook | email_id, reply_body |
| `form.submitted` | Form webhook | form_id, submission_data |
| `meeting.scheduled` | Calendar webhook | meeting_id, scheduled_at |

**Files to Modify:**
- `backend/src/aexy/models/workflow.py`
- `backend/src/aexy/api/workflows.py`
- New: `backend/src/aexy/api/workflow_events.py`
- New: `backend/src/aexy/services/workflow_event_service.py`
- `frontend/src/components/workflow-builder/nodes/WaitNode.tsx`
- `frontend/src/components/workflow-builder/NodeConfigPanel.tsx`

---

## Phase 2: High Priority Improvements

Features that significantly improve usability and adoption.

### 2.1 Visual Field Picker for Data Mapping
**Priority:** P1 - High
**Status:** ✅ Complete
**Estimated Effort:** 3-4 days
**Completed:** 2026-01-10

**Problem:**
Users must type `{{record.values.email}}` manually. No autocomplete, no schema awareness, error-prone.

**Requirements:**
- [x] Fetch available fields from record object schema
- [x] Build field picker dropdown component
- [x] Show field path, type, and sample values
- [x] Support nested field access (record.values.company.name)
- [x] Support previous node outputs in picker
- [x] Insert selected field as template variable
- [x] Validate field paths against schema

**UI Design:**
```
┌─────────────────────────────────────┐
│ To: [Select field...           ▼]  │
├─────────────────────────────────────┤
│ 📋 Record Fields                    │
│   ├─ email (string)                │
│   ├─ first_name (string)           │
│   ├─ company (object)              │
│   │   ├─ name (string)             │
│   │   └─ size (number)             │
│   └─ tags (array)                  │
│ 🔗 Previous Node Outputs           │
│   └─ agent_1.score (number)        │
└─────────────────────────────────────┘
```

**Files to Modify:**
- New: `frontend/src/components/workflow-builder/FieldPicker.tsx`
- `frontend/src/components/workflow-builder/NodeConfigPanel.tsx`
- `backend/src/aexy/api/workflows.py` (add schema endpoint)

---

### 2.2 Enhanced Testing Experience
**Priority:** P1 - High
**Status:** ✅ Complete
**Estimated Effort:** 3-4 days
**Completed:** 2026-01-10

**Problem:**
Test execution shows simple success/failure. No visibility into what each node did.

**Requirements:**
- [x] Return detailed node-by-node results from test execution
- [x] Frontend: Show test results panel after execution
- [x] Highlight executed nodes (green=success, red=failed, gray=skipped)
- [x] Show input/output data for each node
- [x] Show condition evaluation results
- [x] Show branch selection reasoning
- [ ] Allow selecting test record from CRM
- [ ] Save test configurations for reuse

**UI Design:**
```
┌─ Test Results ──────────────────────┐
│ Status: ✅ Completed (2.3s)         │
├─────────────────────────────────────┤
│ ▶ Trigger (record.created) ✅       │
│   Record: John Doe (contact)        │
│                                     │
│ ▶ Condition (lead_score > 50) ✅    │
│   Result: true (score: 75)          │
│                                     │
│ ▶ Action (send_email) ✅            │
│   To: john@example.com              │
│   Subject: Welcome aboard!          │
│   [Dry run - not actually sent]     │
│                                     │
│ ▷ Action (add_to_list) ⏭️ Skipped   │
│   Reason: Branch not taken          │
└─────────────────────────────────────┘
```

**Files to Modify:**
- `frontend/src/components/workflow-builder/WorkflowCanvas.tsx`
- `frontend/src/components/workflow-builder/WorkflowToolbar.tsx`
- New: `frontend/src/components/workflow-builder/TestResultsPanel.tsx`
- `backend/src/aexy/services/workflow_service.py`

---

### 2.3 Workflow Templates
**Priority:** P1 - High
**Status:** ✅ Complete
**Estimated Effort:** 2-3 days
**Completed:** 2026-01-10

**Problem:**
Users start from blank canvas. No guidance on common patterns.

**Requirements:**
- [x] Create template data structure
- [x] Build 5-10 starter templates
- [x] Template selection UI when creating new workflow
- [x] Template preview before selection
- [x] "Start from scratch" option
- [x] Allow saving workflow as template (admin only)

**Starter Templates:**
| Template | Trigger | Actions |
|----------|---------|---------|
| Lead Follow-up | New lead created | Wait 1 day → Send email → Create task |
| Welcome Sequence | Contact created | Send welcome email → Wait 3 days → Send tips email |
| Deal Stage Alert | Deal stage changed | If stage=closed-won → Slack notification |
| Re-engagement | Field changed (last_active) | If inactive 30 days → Send re-engagement email |
| Lead Scoring | New lead | Run scoring agent → Update lead score field |
| Meeting Booked | Webhook (Calendly) | Create activity → Send confirmation → Slack notify |

**Files to Modify:**
- `backend/src/aexy/models/workflow.py`
- `backend/src/aexy/schemas/workflow.py`
- `backend/src/aexy/api/workflows.py`
- New: `backend/src/aexy/data/workflow_templates.py`
- `frontend/src/app/crm/automations/new/page.tsx`
- New: `frontend/src/components/workflow-builder/TemplateSelector.tsx`

---

### 2.4 Improved Error Handling
**Priority:** P1 - High
**Status:** ✅ Complete
**Estimated Effort:** 2-3 days
**Completed:** 2026-01-10

**Problem:**
Validation errors shown in generic modal. No inline feedback. Failed actions don't retry.

**Requirements:**
- [x] Inline validation warnings on nodes (red border + icon)
- [x] Hover tooltip with specific error message
- [x] Real-time validation as user configures
- [x] Retry logic for transient failures (API errors, rate limits)
- [x] Configurable retry count and backoff
- [x] Dead letter queue for permanently failed executions
- [ ] Email notification on workflow failure (optional)

**Retry Configuration:**
```python
class RetryConfig:
    max_retries: int = 3
    initial_delay_seconds: int = 60
    backoff_multiplier: float = 2.0
    max_delay_seconds: int = 3600
    retryable_errors: list[str] = ['timeout', 'rate_limit', 'server_error']
```

**Files to Modify:**
- `frontend/src/components/workflow-builder/nodes/*.tsx`
- `frontend/src/components/workflow-builder/NodeConfigPanel.tsx`
- `backend/src/aexy/services/workflow_service.py`
- `backend/src/aexy/services/workflow_actions.py`

---

## Phase 3: Medium Priority Improvements

Features that enhance power user capabilities.

### 3.1 Parallel Execution
**Priority:** P2 - Medium
**Status:** ✅ Complete
**Estimated Effort:** 3-4 days
**Completed:** 2026-01-10

**Problem:**
Execution is sequential even when nodes are independent. Slow for workflows with multiple branches.

**Requirements:**
- [x] Detect independent branches in DAG
- [x] Execute independent nodes concurrently
- [x] Add "Join" node type for convergence
- [x] Handle partial failures in parallel branches
- [x] Maintain execution order where dependencies exist

**Implementation:**
- Added "join" node type to NODE_TYPES with subtypes: all, any, count
- Created JoinNode.tsx frontend component with teal color scheme, multiple input handles, join type indicator
- Added JoinNode to nodeTypes in WorkflowCanvas with MiniMap color support
- Added join category to NodePalette with Wait for All/Any/Count subtypes
- Added renderJoinConfig to NodeConfigPanel with join_type, expected_count, incoming_branches, on_failure settings
- Backend: Added helper methods for parallel execution:
  - `_build_reverse_graph` - Build reverse adjacency list for finding incoming edges
  - `_find_parallel_branches` - Detect branches starting from nodes with multiple outputs
  - `_execute_parallel_branches` - Execute multiple branches concurrently with asyncio.gather()
  - `_execute_join` - Wait for branches based on join_type (all/any/count)
- Updated `execute_workflow` to detect and execute parallel branches
- On failure handling: "fail" stops workflow, "continue" uses successful results, "skip" bypasses join

---

### 3.2 Webhook Trigger URL Display
**Priority:** P2 - Medium
**Status:** ✅ Complete
**Estimated Effort:** 1 day
**Completed:** 2026-01-10

**Problem:**
Webhook triggers don't show the generated URL. Users can't integrate external systems.

**Requirements:**
- [x] Generate unique webhook URL per workflow
- [x] Display URL in trigger configuration
- [x] Copy-to-clipboard button
- [x] Show sample payload format
- [ ] Webhook request logging (future enhancement)

**Implementation:**
- Added `/webhooks/automations/{automation_id}/trigger` public endpoint for receiving webhook triggers
- Added `/workflow/webhook-url` API endpoint to get webhook URL info and sample payload
- Updated NodeConfigPanel to display webhook URL when trigger type is webhook_received
- Copy button with visual feedback (checkmark on copy)
- Collapsible sample payload section with JSON formatting
- Info box explaining how to use the webhook and available template variables

---

### 3.3 Workflow Import/Export
**Priority:** P2 - Medium
**Status:** ✅ Complete
**Estimated Effort:** 2 days
**Completed:** 2026-01-10

**Problem:**
No way to backup, share, or migrate workflows between workspaces.

**Requirements:**
- [x] Export workflow as JSON file
- [x] Import workflow from JSON
- [x] Handle ID remapping on import
- [x] Validate imported workflow schema
- [x] Option to import as draft

**Implementation:**
- Added `/workflow/export` endpoint returning versioned JSON with metadata, nodes, edges, viewport
- Added `/workflow/import` endpoint with ID remapping to avoid collisions, schema validation, and draft option
- Added Download/Upload buttons to WorkflowToolbar with loading states
- Import modal with file picker, error handling, and warning about replacement
- Frontend handlers in WorkflowCanvas: handleExport creates downloadable JSON file, handleImport calls API and refreshes canvas

---

### 3.4 Version History & Diff
**Priority:** P2 - Medium
**Status:** ✅ Complete
**Estimated Effort:** 2-3 days
**Completed:** 2026-01-10

**Problem:**
Version number tracked but no way to view or restore previous versions.

**Requirements:**
- [x] Store full workflow snapshot on each save
- [x] List version history in UI
- [x] Visual diff between versions
- [x] Restore previous version
- [x] Limit stored versions (keep last 20)

**Implementation:**
- Created `WorkflowVersion` model to store version snapshots with nodes, edges, viewport, change_summary
- Auto-generate change summaries by diffing nodes/edges (added, removed, modified)
- Service methods: `list_versions`, `get_version`, `restore_version`, `compare_versions`
- API endpoints: GET `/versions`, GET `/versions/{version}`, POST `/versions/{version}/restore`, GET `/versions/compare`
- `VersionHistory` UI component with:
  - Version list with change summaries and timestamps
  - Compare mode to select two versions for diff view
  - Visual diff showing added (green), removed (red), modified (amber) nodes
  - Restore button to rollback to any previous version
- Added version history button (GitBranch icon) to WorkflowToolbar
- Cleanup old versions (MAX_WORKFLOW_VERSIONS = 20)

---

### 3.5 Keyboard Shortcuts
**Priority:** P2 - Medium
**Status:** ✅ Complete
**Estimated Effort:** 1-2 days
**Completed:** 2026-01-10

**Problem:**
All interactions require mouse. Power users want keyboard efficiency.

**Shortcuts Implemented:**
| Shortcut | Action | Status |
|----------|--------|--------|
| `Delete` / `Backspace` | Delete selected node | ✅ |
| `Cmd+S` | Save workflow | ✅ |
| `Cmd+Enter` | Test workflow | ✅ |
| `Escape` | Deselect / close panel | ✅ |
| `Cmd+F` | Fit view | ✅ |
| `Cmd+C` / `Cmd+V` | Copy/paste node | Future |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo/redo | Future |
| `1-6` | Add node type | Future |

**Implementation:**
- Added keyboard event listener in WorkflowCanvas
- Detects Mac vs Windows for Cmd/Ctrl key
- Ignores shortcuts when focused on input/textarea
- Cross-platform support

---

### 3.6 True Drag-and-Drop from Palette
**Priority:** P2 - Medium
**Status:** ✅ Complete
**Estimated Effort:** 1-2 days
**Completed:** 2026-01-10

**Problem:**
Palette uses click-to-add. Expected behavior is drag onto canvas.

**Requirements:**
- [x] Implement drag from palette
- [x] Drop zone highlighting on canvas
- [x] Snap to grid on drop
- [ ] Auto-connect to nearest node (future enhancement)

**Implementation:**
- Updated NodePalette to make all node buttons draggable with `draggable` attribute
- Added `handleDragStart` to set `application/reactflow` transfer data with node type and subtype
- Added `onDragOver` and `onDrop` handlers to WorkflowCanvas ReactFlow component
- Uses `screenToFlowPosition` to convert drop coordinates to flow coordinates
- Updated addNode function to accept optional position parameter
- Updated help text to "Drag nodes to canvas or click to add"
- Snap to grid works via ReactFlow's existing `snapToGrid` setting

---

## Phase 4: Polish & Performance

### 4.1 Execution Visualization
**Priority:** P3 - Low
**Status:** ✅ Complete
**Estimated Effort:** 2 days
**Completed:** 2026-01-10

- [x] Animate edges during execution
- [x] Pulse effect on active node
- [x] Show execution metrics per node (duration)
- [x] Execution path highlighting

**Implementation:**
- Created `AnimatedEdge` component with animated particles flowing during execution, color-coded status (blue=running, green=success, red=failed), and duration labels on completed edges
- Created `useExecutionState` hook for shared execution visualization logic across all node types
- Updated all node components (TriggerNode, ActionNode, ConditionNode, WaitNode, AgentNode, BranchNode, JoinNode) with:
  - Status indicator badges (loader spinner=running, checkmark=success, X=failed, skip icon=skipped)
  - Duration badge showing execution time in ms
  - Pulse animation on running nodes (border glow + animate-pulse)
  - Opacity reduction for skipped nodes
- Enhanced `WorkflowCanvas` to track execution state:
  - `nodeResultsMap` for quick lookup of execution results
  - Pass `executionStatus`, `executionDurationMs`, `conditionResult`, `selectedBranch` to nodes
  - Enhanced edges with execution status, showing which paths were taken

---

### 4.2 Performance Optimizations
**Priority:** P3 - Low
**Status:** ✅ Complete
**Estimated Effort:** 2-3 days
**Completed:** 2026-01-10

- [x] Cache workflow definitions (Redis infrastructure added)
- [x] Precompute topological sort on save
- [ ] Optimize N+1 queries in execution (future)
- [ ] Lazy load node configurations (future)
- [ ] Virtualize large workflow canvases (future - React Flow handles this)

**Implementation:**
- Created `WorkflowCache` class in `backend/src/aexy/cache/workflow_cache.py`:
  - Redis-based caching for workflow definitions (1 hour TTL)
  - Topological sort caching with version-specific keys (24 hour TTL)
  - `InMemoryWorkflowCache` fallback when Redis unavailable
  - Static `compute_topo_sort` method using Kahn's algorithm
- Added `execution_order` column to `WorkflowDefinition` model:
  - Stores precomputed topological sort as JSONB array
  - Updated on every workflow save via `update_workflow`
  - Used by `SyncWorkflowExecutor` to skip runtime computation
- Updated `workflow_execution_service.py` to use precomputed order when available

---

### 4.3 Dark Mode Support
**Priority:** P3 - Low
**Status:** ✅ Complete
**Estimated Effort:** 1 day
**Completed:** 2026-01-10

- [x] Node color schemes for dark mode
- [x] Canvas background adaptation
- [x] Panel styling for dark mode

**Implementation:**
The workflow builder was designed with dark mode as the default theme:
- All nodes use dark gradients (from-{color}-500/20 to-{color}-600/10)
- Canvas background: slate-900 with slate-700 grid
- Side panels: slate-800 with slate-700 borders
- Controls and MiniMap: slate-800 backgrounds
- Text: white/slate-300/slate-400 for hierarchy
- This provides excellent contrast and reduces eye strain

---

### 4.4 Mobile Responsiveness
**Priority:** P3 - Low
**Status:** ✅ Complete
**Estimated Effort:** 2 days
**Completed:** 2026-01-10

- [x] Responsive layout for tablet
- [x] Touch-friendly node selection
- [x] Collapsible panels on small screens

**Implementation:**
- Updated `NodePalette` with responsive behavior:
  - Hidden by default on mobile (md:block)
  - Collapsed mode showing only icons (w-14)
  - Toggle button to expand/collapse
- Added mobile floating action button (FAB) to toggle palette:
  - Fixed position bottom-left
  - Opens palette as overlay on mobile
  - Auto-closes after adding a node
- Updated `NodeConfigPanel` for mobile:
  - Full-width overlay on mobile (w-full sm:w-96)
  - Backdrop overlay when open on mobile
  - Fixed positioning with z-index management
  - Touch-friendly close button with larger tap target
- All panels use proper z-index layering for mobile overlays
- React Flow's built-in touch support handles node selection/dragging

---

## Database Migrations Required

### New Tables
```sql
-- Workflow execution tracking
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
    automation_id UUID NOT NULL REFERENCES crm_automations(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    record_id UUID REFERENCES crm_records(id),
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    current_node_id VARCHAR(100),
    context JSONB DEFAULT '{}',
    trigger_data JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    resume_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Per-node execution results
CREATE TABLE workflow_execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    node_id VARCHAR(100) NOT NULL,
    node_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    input_data JSONB,
    output_data JSONB,
    error TEXT,
    duration_ms INTEGER,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event subscriptions for wait nodes
CREATE TABLE workflow_event_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_filter JSONB DEFAULT '{}',
    timeout_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow templates
CREATE TABLE workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    is_system BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow version history
CREATE TABLE workflow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    viewport JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_id, version)
);

-- Indexes
CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_resume ON workflow_executions(resume_at) WHERE status = 'paused';
CREATE INDEX idx_execution_steps_execution ON workflow_execution_steps(execution_id);
CREATE INDEX idx_event_subscriptions_type ON workflow_event_subscriptions(event_type);
CREATE INDEX idx_workflow_versions_workflow ON workflow_versions(workflow_id);
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Workflow creation completion rate | Unknown | > 80% |
| Avg time to create first workflow | Unknown | < 5 min |
| Workflow execution success rate | Unknown | > 95% |
| Test execution usage | 0 | > 50% of workflows tested |
| Template usage | N/A | > 40% start from template |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wait scheduling complexity | High | Start with simple duration waits, add events later |
| Agent execution timeouts | Medium | Implement hard timeout + graceful cancellation |
| Large workflow performance | Medium | Add virtualization, limit node count initially |
| Breaking changes to workflow schema | High | Version schema, migrate existing workflows |

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-10 | 1.0 | Initial PRD created |
| 2026-01-10 | 1.1 | Phase 1.1 (Wait Node Scheduling) completed - Added WorkflowExecution/WorkflowExecutionStep models, Celery tasks for execution/resumption, API endpoints for execution history |
| 2026-01-10 | 1.2 | Phase 1.2 (Agent Node Execution) completed - Added SyncAgentService, wired agent nodes to LangGraph agents, support for input/output mapping |
| 2026-01-10 | 1.3 | Phase 1.3 (Execution History UI) completed - Added ExecutionHistory component with execution list, detail view, step breakdown, and node highlighting |
| 2026-01-10 | 1.4 | Phase 1.4 (Event-Based Wait System) completed - Added WorkflowEventSubscription model, webhook receiver endpoints (email tracking, forms, meetings, custom), event matching service with filter support, enhanced wait node UI with all 10 event types, Celery task for subscription timeouts |
| 2026-01-10 | 2.1 | Phase 2.1 (Visual Field Picker) completed - Added field-schema and node-outputs API endpoints, created FieldPicker component with searchable dropdown, integrated into email/message templates and condition fields, supports record fields, trigger data, system variables, and previous node outputs |
| 2026-01-10 | 2.2 | Phase 2.2 (Enhanced Testing Experience) completed - Created TestResultsPanel component with status summary, expandable node results, condition/branch visualization, dry run notice; integrated into WorkflowCanvas with highlighted nodes and test state management |
| 2026-01-10 | 2.3 | Phase 2.3 (Workflow Templates) completed - Added WorkflowTemplate model, created 8 built-in templates (Lead Follow-up, Welcome Sequence, Deal Stage Alert, Re-engagement, AI Lead Scoring, Meeting Booked, Auto Data Enrichment, AI Sales Outreach), API endpoints for template CRUD and apply, TemplateSelector UI component with category filtering and search |
| 2026-01-10 | 2.4 | Phase 2.4 (Improved Error Handling) completed - Added retry configuration to workflow model (DEFAULT_RETRY_CONFIG, RETRYABLE_ERROR_TYPES), created WorkflowDeadLetter model for dead letter queue, added retry tracking fields to WorkflowExecutionStep, created SyncWorkflowRetryService with exponential backoff, added process_workflow_retries Celery task, created useWorkflowValidation hook for real-time frontend validation, updated all node components (Trigger, Action, Condition, Wait, Agent, Branch) with inline error display (red border, error badge, error message tooltip), added validation status indicator to WorkflowToolbar |
| 2026-01-10 | 3.2 | Phase 3.2 (Webhook Trigger URL Display) completed - Added `/webhooks/automations/{automation_id}/trigger` public endpoint for webhook triggers, added `/workflow/webhook-url` API endpoint, updated NodeConfigPanel to display webhook URL with copy button and sample payload for webhook trigger type |
| 2026-01-10 | 3.5 | Phase 3.5 (Keyboard Shortcuts) completed - Added keyboard event handler in WorkflowCanvas with Delete/Backspace (delete node), Cmd+S (save), Cmd+Enter (test), Escape (close/deselect), Cmd+F (fit view), cross-platform Cmd/Ctrl detection, ignores shortcuts when typing in inputs |
| 2026-01-10 | 3.3 | Phase 3.3 (Workflow Import/Export) completed - Added /workflow/export and /workflow/import API endpoints with ID remapping and schema validation, added Download/Upload buttons to WorkflowToolbar, import modal with file picker and error handling, frontend handlers in WorkflowCanvas |
| 2026-01-10 | 3.6 | Phase 3.6 (True Drag-and-Drop from Palette) completed - Made NodePalette items draggable with application/reactflow transfer data, added onDragOver/onDrop handlers to WorkflowCanvas, uses screenToFlowPosition for accurate drop positioning, works with existing snap-to-grid |
| 2026-01-10 | 3.4 | Phase 3.4 (Version History & Diff) completed - Created WorkflowVersion model for snapshots, auto-generate change summaries, list_versions/get_version/restore_version/compare_versions service methods, API endpoints for version CRUD, VersionHistory UI component with version list/compare mode/visual diff/restore button, version history button in toolbar |
| 2026-01-10 | 3.1 | Phase 3.1 (Parallel Execution) completed - Added join node type with all/any/count subtypes, JoinNode.tsx frontend component with multiple input handles, parallel execution using asyncio.gather(), join node configuration panel with failure handling options |
| 2026-01-10 | 4.1 | Phase 4.1 (Execution Visualization) completed - Created AnimatedEdge component with animated particles, useExecutionState hook for shared logic, updated all node components with status indicators (spinner/checkmark/X), duration badges, pulse animations, and skipped state styling |
| 2026-01-10 | 4.2 | Phase 4.2 (Performance Optimizations) completed - Created WorkflowCache for Redis caching, added execution_order column to WorkflowDefinition for precomputed topological sort, updated SyncWorkflowExecutor to use cached order |
| 2026-01-10 | 4.3 | Phase 4.3 (Dark Mode Support) completed - Workflow builder designed with dark mode as default (slate-900 canvas, dark gradients on nodes, slate-800 panels) |
| 2026-01-10 | 4.4 | Phase 4.4 (Mobile Responsiveness) completed - Added responsive NodePalette with collapsible mode, mobile FAB to toggle palette overlay, NodeConfigPanel as full-width mobile overlay with backdrop, proper z-index layering |

