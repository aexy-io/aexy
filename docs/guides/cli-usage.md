# Aexy CLI Usage Guide

## Installation

### From PyPI

```bash
pip install aexy-cli
```

### From Source

```bash
cd aexy-cli
pip install -e .
```

## Configuration

### Authentication

```bash
# Get your API token from the Aexy web dashboard
aexy login <your-api-token>
```

Token is stored securely in system keychain.

### Set API URL (Optional)

```bash
# Default: http://localhost:8000/api
export DEVOGRAPH_API_URL=https://api.aexy.io/api
```

### Check Status

```bash
aexy status
```

## Commands

### Profile Commands

```bash
# Show developer profile
aexy profile show @username

# Show full profile with analysis
aexy profile show @username --full

# List all developers
aexy profile list
aexy profile list --limit 50

# Export profile
aexy profile export @username --format pdf
aexy profile export @username --format csv --output profile.csv
```

### Team Commands

```bash
# List all teams
aexy team list

# Show team skill distribution
aexy team skills
aexy team skills "Backend Team"

# Identify skill gaps
aexy team gaps
aexy team gaps "Backend Team" --target-skills python,kubernetes

# Show workload distribution
aexy team workload
aexy team workload "Backend Team"
```

### Task Matching

```bash
# Match a task to best developers
aexy match "Fix authentication bug in OAuth flow"

# With required skills
aexy match "Build Kubernetes operator" -s python -s kubernetes -s go

# Show top N matches
aexy match "Implement caching layer" --top 10
```

### Insights Commands

```bash
# View attrition risk for a developer
aexy insights attrition @username

# View all developers' attrition risk
aexy insights attrition --all

# View burnout risk
aexy insights burnout @username

# View performance trajectory
aexy insights trajectory @username --months 6

# View team health analysis
aexy insights team-health
aexy insights team-health "Backend Team"
```

### Report Commands

```bash
# List available reports
aexy report list

# Generate a report
aexy report generate weekly
aexy report generate monthly --format pdf
aexy report generate team --format xlsx --output team-report.xlsx

# Check export status
aexy report status <job-id>

# Export raw data
aexy report export developers --format csv --output developers.csv
aexy report export skills --format json --output skills.json
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
aexy report export developers --format json --output /tmp/devs.json

# Get attrition risks in machine-readable format
aexy insights attrition --all --format json 2>/dev/null | jq '.[] | select(.risk_score > 0.5)'
```

### Aliases

Add to your shell config:

```bash
alias gp='aexy profile'
alias gt='aexy team'
alias gm='aexy match'
alias gi='aexy insights'
```

### Shell Completion

```bash
# Bash
eval "$(_DEVOGRAPH_COMPLETE=bash_source aexy)"

# Zsh
eval "$(_DEVOGRAPH_COMPLETE=zsh_source aexy)"

# Fish
_DEVOGRAPH_COMPLETE=fish_source aexy | source
```
