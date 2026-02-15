# /test-ui

Test UI/UX workflows interactively using Playwright browser automation.

## Arguments

$ARGUMENTS - page or flow to test (e.g., "leave", "dashboard", "settings"), or flags:
- `--report` to show current test state summary
- `--run` to execute Playwright spec tests and update state

## Instructions

You are a UI/UX testing agent. Follow the workflow below based on the arguments provided.

### Step 0: Load State

Read `frontend/e2e/ui-test-state.yaml` to understand what has been tested before, what's stale, and what issues are open.

### Page Registry

Use this registry to resolve page names to paths and spec files:

| Page | Path | Spec File | Key Flows |
|------|------|-----------|-----------|
| dashboard | /dashboard | e2e/dashboard.spec.ts | Widget rendering, edit layout, customize modal, preset switching, grid layout |
| leave | /leave | e2e/leave.spec.ts | Tab navigation, leave balances, request form, approvals, settings (types/policies/holidays) |
| calendar | /booking/team-calendar | e2e/leave.spec.ts | Unified view, booking tab, filters, who-is-out panel |
| agents | /agents | — | Agent list, create agent, edit agent, agent metrics, agent chat |
| tracking | /tracking | — | Time entries, reports, timer |
| settings | /settings | — | Profile, workspace, permissions, billing |
| sprints | /tickets | — | Sprint board, ticket management |
| compliance | /compliance | — | Document center, reminders, certifications, training |
| insights | /insights | — | Developer insights, sprint capacity, repositories |
| crm | /crm | — | CRM objects, records, activities |
| docs | /docs | — | Document editor, knowledge graph |
| hiring | /hiring | — | Candidates, assessments, templates |
| reviews | /reviews | — | Goals, review cycles |
| learning | /learning | — | Learning analytics, integrations |
| automations | /automations | — | Automation list, create automation |
| email-marketing | /email-marketing | — | Campaigns, templates |
| uptime | /uptime | — | Uptime monitors, incidents |
| forms | /forms | — | Form builder, submissions |
| booking | /booking | — | Event types, availability, bookings |

### Mode Detection

Based on $ARGUMENTS:

- If `--report`: go to **Report Mode**
- If `--run`: go to **Spec Runner Mode**
- If a page name is given (e.g., "leave", "dashboard"): go to **Interactive Test Mode** for that page
- If empty/no args: go to **Smart Pick Mode** — read the state file and pick the least-recently-tested or untested page, then run Interactive Test Mode for it

---

### Report Mode (`--report`)

1. Read `frontend/e2e/ui-test-state.yaml`
2. Print a summary table:
   ```
   Page         | Path              | Status   | Last Tested | Issues
   -------------|-------------------|----------|-------------|-------
   dashboard    | /dashboard        | pass     | 2026-02-14  | 0
   leave        | /leave            | partial  | 2026-02-14  | 1
   agents       | /agents           | untested | —           | —
   ...
   ```
3. Print open issues with severity
4. Suggest which pages to test next (untested first, then stale > 7 days)

---

### Spec Runner Mode (`--run`)

1. Run Playwright E2E tests:
   ```bash
   cd frontend && npx playwright test --reporter=list 2>&1
   ```
2. Parse the output for pass/fail counts per spec file
3. Update `ui-test-state.yaml` — set `spec_status` for each page that has a spec file
4. Report results summary to the user

---

### Interactive Test Mode (page name given)

This is the core testing workflow. Follow these steps carefully:

#### 1. Authenticate

Generate a fresh auth token:
```bash
docker exec aexy-backend python scripts/generate_test_token.py --first
```

If docker is not available or the command fails, inform the user and ask them to provide a token or start the backend.

#### 2. Determine Browser Tools

Check which browser automation tools are available:
- **Playwright MCP** (`mcp__playwright__*`): Preferred for headless testing. Use `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_evaluate`, etc.
- **Chrome MCP** (`mcp__claude-in-chrome__*`): Alternative for testing in real Chrome. Use `navigate`, `read_page`, `computer`, `javascript_tool`, etc.

Use whichever is available. If both are available, prefer Playwright MCP unless the user requests Chrome.

#### 3. Set Up Browser Session

Using Playwright MCP:
1. Navigate to `http://localhost:3000`
2. Set auth token via `browser_evaluate`:
   ```javascript
   () => {
     localStorage.setItem('token', '<TOKEN>');
     localStorage.setItem('current_workspace_id', '<WORKSPACE_ID_IF_KNOWN>');
     return 'Auth set';
   }
   ```
3. Navigate to the target page path from the registry

Using Chrome MCP:
1. Call `tabs_context_mcp` to see current tabs
2. Create a new tab with `tabs_create_mcp` to `http://localhost:3000`
3. Set token via `javascript_tool`
4. Navigate to the target page

#### 4. Take Initial Snapshot

Take a `browser_snapshot` (accessibility tree) to get the page structure. This is the primary analysis input — it shows all interactive elements, their roles, states, and hierarchy.

#### 5. Systematic Testing

For each page, test these categories:

**a) Page Load & Structure**
- Does the page render without errors?
- Are all expected headings, navigation elements, and primary content visible?
- Check the accessibility tree for proper semantic structure (headings, landmarks, roles)

**b) Navigation & Tabs**
- Click through all tabs/sub-navigation
- Verify each tab loads the expected content
- Take snapshots after each navigation

**c) Interactive Elements**
- Test buttons: do they trigger expected actions (modals, forms, state changes)?
- Test forms: are all fields present? Do dropdowns populate?
- Test modals: do they open and close correctly?
- DO NOT submit forms that would create real data — just verify the form renders and validates

**d) Data Display**
- Are lists/tables populated (or showing appropriate empty states)?
- Do status badges, counts, and labels render correctly?

**e) Visual Check**
- Take a screenshot for the record
- Note any obvious layout issues, overflow, or misalignment

#### 6. Run Related Specs

If the page has a spec file in the registry, run it:
```bash
cd frontend && npx playwright test <spec-file> --reporter=list 2>&1
```

Record the pass/fail result.

#### 7. Save Screenshot

Take a final screenshot and save it:
- Use `browser_take_screenshot` to capture the page
- Note the screenshot in the state file

#### 8. Update State File

Update `frontend/e2e/ui-test-state.yaml` with:
- `last_tested` timestamp
- `status`: pass | fail | partial
- `flows_tested`: list of what you tested and results
- `issues`: any problems found (with severity, description, element reference)
- `spec_status`: if specs were run
- `screenshots`: reference to saved screenshot

#### 9. Report to User

Provide a concise summary:
- What was tested
- What passed / what failed
- Any issues found (with severity)
- Suggested next steps

---

### State File Format

The state file `frontend/e2e/ui-test-state.yaml` uses this schema:

```yaml
last_updated: "ISO-8601 timestamp"
session_count: N

pages:
  <page-key>:
    path: /route-path
    last_tested: "ISO-8601 timestamp"
    status: pass | fail | partial | untested
    spec_file: e2e/filename.spec.ts  # or null
    spec_status: pass | fail | null
    flows_tested:
      - name: "Flow description"
        status: pass | fail
        notes: "Details"
    issues:
      - id: N
        severity: critical | high | medium | low
        description: "What's wrong"
        page: /path
        element: "selector or snapshot ref"
        found: "ISO-8601"
        resolved: null | "ISO-8601"
    screenshots:
      - path: screenshots/filename.png
        timestamp: "ISO-8601"

summary:
  total_pages: N
  tested: N
  passing: N
  failing: N
  partial: N
  untested: N
  open_issues: N
  critical_issues: N
```

When updating the state file:
- Preserve existing data for pages you didn't test this session
- Increment `session_count`
- Update `last_updated`
- Recalculate `summary` counts
- Use the Write tool to save the YAML file

---

### Issue Severity Guide

- **critical**: Page won't load, data loss risk, security issue, complete feature broken
- **high**: Major feature broken, but workaround exists; accessibility blocker
- **medium**: UI glitch, minor feature broken, poor UX but functional
- **low**: Cosmetic issue, minor text/alignment problem, nice-to-have improvement

---

### Important Notes

- DO NOT trigger JavaScript alerts/confirms/prompts — they block browser automation
- If a page requires specific setup (e.g., workspace data), note it as a prerequisite rather than failing the test
- If the browser tools are not responding after 2-3 attempts, stop and inform the user
- Keep testing focused — don't go down rabbit holes exploring unrelated pages
- Always save state before reporting results, so progress isn't lost
