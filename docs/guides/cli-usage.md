# Devograph CLI Usage Guide

## Installation

### From PyPI

```bash
pip install devograph-cli
```

### From Source

```bash
cd devograph-cli
pip install -e .
```

## Configuration

### Authentication

```bash
# Get your API token from the Devograph web dashboard
devograph login <your-api-token>
```

Token is stored securely in system keychain.

### Set API URL (Optional)

```bash
# Default: http://localhost:8000/api
export DEVOGRAPH_API_URL=https://api.devograph.io/api
```

### Check Status

```bash
devograph status
```

## Commands

### Profile Commands

```bash
# Show developer profile
devograph profile show @username

# Show full profile with analysis
devograph profile show @username --full

# List all developers
devograph profile list
devograph profile list --limit 50

# Export profile
devograph profile export @username --format pdf
devograph profile export @username --format csv --output profile.csv
```

### Team Commands

```bash
# List all teams
devograph team list

# Show team skill distribution
devograph team skills
devograph team skills "Backend Team"

# Identify skill gaps
devograph team gaps
devograph team gaps "Backend Team" --target-skills python,kubernetes

# Show workload distribution
devograph team workload
devograph team workload "Backend Team"
```

### Task Matching

```bash
# Match a task to best developers
devograph match "Fix authentication bug in OAuth flow"

# With required skills
devograph match "Build Kubernetes operator" -s python -s kubernetes -s go

# Show top N matches
devograph match "Implement caching layer" --top 10
```

### Insights Commands

```bash
# View attrition risk for a developer
devograph insights attrition @username

# View all developers' attrition risk
devograph insights attrition --all

# View burnout risk
devograph insights burnout @username

# View performance trajectory
devograph insights trajectory @username --months 6

# View team health analysis
devograph insights team-health
devograph insights team-health "Backend Team"
```

### Report Commands

```bash
# List available reports
devograph report list

# Generate a report
devograph report generate weekly
devograph report generate monthly --format pdf
devograph report generate team --format xlsx --output team-report.xlsx

# Check export status
devograph report status <job-id>

# Export raw data
devograph report export developers --format csv --output developers.csv
devograph report export skills --format json --output skills.json
```

## Output Examples

### Profile Output

```
╭──────────────────────────────────────────────────────────────╮
│                        John Developer                         │
├──────────────────────────────────────────────────────────────┤
│ Name       │ John Developer                                  │
│ GitHub     │ @johndeveloper                                  │
│ Seniority  │ Senior                                          │
│ Skills     │ Python, TypeScript, React, PostgreSQL, Docker   │
│ Email      │ john@example.com                                │
│ Location   │ San Francisco, CA                               │
╰──────────────────────────────────────────────────────────────╯
```

### Team Skills Output

```
╭──────────────────────────────────────────────────────────────╮
│                  Backend Team - 8 developers                  │
├──────────────────────────────────────────────────────────────┤
                      Skill Distribution
┏━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━┓
┃ Skill          ┃ Avg Level            ┃ Coverage  ┃ Experts ┃
┡━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━╇━━━━━━━━━┩
│ Python         │ ████████░░ 78%       │ 100%      │ 5       │
│ PostgreSQL     │ ███████░░░ 65%       │ 88%       │ 3       │
│ Docker         │ ██████░░░░ 55%       │ 75%       │ 2       │
│ Kubernetes     │ ████░░░░░░ 35%       │ 50%       │ 1       │
│ AWS            │ █████░░░░░ 45%       │ 63%       │ 2       │
└────────────────┴──────────────────────┴───────────┴─────────┘
```

### Task Matching Output

```
╭──────────────────────────────────────────────────────────────╮
│ Task: Fix authentication bug in OAuth flow                    │
│ Required skills: python, oauth                                │
╰──────────────────────────────────────────────────────────────╯

                    Top 5 Matches
┏━━━┳━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┓
┃ # ┃ Developer         ┃ Score          ┃ Matching Skills      ┃
┡━━━╇━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━┩
│ 1 │ @sarah_auth       │ ██████████ 95% │ python, oauth, jwt   │
│ 2 │ @mike_backend     │ ████████░░ 82% │ python, oauth        │
│ 3 │ @jane_security    │ ███████░░░ 75% │ oauth, security      │
│ 4 │ @tom_senior       │ ██████░░░░ 68% │ python               │
│ 5 │ @alex_dev         │ █████░░░░░ 55% │ python               │
└───┴───────────────────┴────────────────┴──────────────────────┘
```

### Attrition Risk Output

```
╭──────────────────────────────────────────────────────────────╮
│                 Attrition Risk Analysis                       │
│ Developer: @johndeveloper                                     │
│ Risk Level: MODERATE                                          │
│ Risk Score: 45%                                               │
│ Confidence: 78%                                               │
╰──────────────────────────────────────────────────────────────╯

                    Risk Factors
┏━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━┓
┃ Factor                  ┃ Weight        ┃ Trend               ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━┩
│ Declining activity      │ ████░░░░░░ 40%│ declining           │
│ Reduced collaboration   │ ███░░░░░░░ 30%│ stable              │
│ Extended hours          │ ██░░░░░░░░ 20%│ improving           │
└─────────────────────────┴───────────────┴─────────────────────┘

Recommendations:
  • Schedule a 1:1 to discuss workload and career goals
  • Consider assigning more challenging projects
  • Review team dynamics and collaboration opportunities
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEVOGRAPH_API_URL` | API base URL | `http://localhost:8000/api` |
| `DEVOGRAPH_API_TOKEN` | API token (alternative to keyring) | - |

## Tips

### Scripting

```bash
# Export all developer profiles to JSON
devograph report export developers --format json --output /tmp/devs.json

# Get attrition risks in machine-readable format
devograph insights attrition --all --format json 2>/dev/null | jq '.[] | select(.risk_score > 0.5)'
```

### Aliases

Add to your shell config:

```bash
alias gp='devograph profile'
alias gt='devograph team'
alias gm='devograph match'
alias gi='devograph insights'
```

### Shell Completion

```bash
# Bash
eval "$(_DEVOGRAPH_COMPLETE=bash_source devograph)"

# Zsh
eval "$(_DEVOGRAPH_COMPLETE=zsh_source devograph)"

# Fish
_DEVOGRAPH_COMPLETE=fish_source devograph | source
```
