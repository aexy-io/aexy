# Gitraki CLI Usage Guide

## Installation

### From PyPI

```bash
pip install gitraki-cli
```

### From Source

```bash
cd gitraki-cli
pip install -e .
```

## Configuration

### Authentication

```bash
# Get your API token from the Gitraki web dashboard
gitraki login <your-api-token>
```

Token is stored securely in system keychain.

### Set API URL (Optional)

```bash
# Default: http://localhost:8000/api
export GITRAKI_API_URL=https://api.gitraki.io/api
```

### Check Status

```bash
gitraki status
```

## Commands

### Profile Commands

```bash
# Show developer profile
gitraki profile show @username

# Show full profile with analysis
gitraki profile show @username --full

# List all developers
gitraki profile list
gitraki profile list --limit 50

# Export profile
gitraki profile export @username --format pdf
gitraki profile export @username --format csv --output profile.csv
```

### Team Commands

```bash
# List all teams
gitraki team list

# Show team skill distribution
gitraki team skills
gitraki team skills "Backend Team"

# Identify skill gaps
gitraki team gaps
gitraki team gaps "Backend Team" --target-skills python,kubernetes

# Show workload distribution
gitraki team workload
gitraki team workload "Backend Team"
```

### Task Matching

```bash
# Match a task to best developers
gitraki match "Fix authentication bug in OAuth flow"

# With required skills
gitraki match "Build Kubernetes operator" -s python -s kubernetes -s go

# Show top N matches
gitraki match "Implement caching layer" --top 10
```

### Insights Commands

```bash
# View attrition risk for a developer
gitraki insights attrition @username

# View all developers' attrition risk
gitraki insights attrition --all

# View burnout risk
gitraki insights burnout @username

# View performance trajectory
gitraki insights trajectory @username --months 6

# View team health analysis
gitraki insights team-health
gitraki insights team-health "Backend Team"
```

### Report Commands

```bash
# List available reports
gitraki report list

# Generate a report
gitraki report generate weekly
gitraki report generate monthly --format pdf
gitraki report generate team --format xlsx --output team-report.xlsx

# Check export status
gitraki report status <job-id>

# Export raw data
gitraki report export developers --format csv --output developers.csv
gitraki report export skills --format json --output skills.json
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
| `GITRAKI_API_URL` | API base URL | `http://localhost:8000/api` |
| `GITRAKI_API_TOKEN` | API token (alternative to keyring) | - |

## Tips

### Scripting

```bash
# Export all developer profiles to JSON
gitraki report export developers --format json --output /tmp/devs.json

# Get attrition risks in machine-readable format
gitraki insights attrition --all --format json 2>/dev/null | jq '.[] | select(.risk_score > 0.5)'
```

### Aliases

Add to your shell config:

```bash
alias gp='gitraki profile'
alias gt='gitraki team'
alias gm='gitraki match'
alias gi='gitraki insights'
```

### Shell Completion

```bash
# Bash
eval "$(_GITRAKI_COMPLETE=bash_source gitraki)"

# Zsh
eval "$(_GITRAKI_COMPLETE=zsh_source gitraki)"

# Fish
_GITRAKI_COMPLETE=fish_source gitraki | source
```
