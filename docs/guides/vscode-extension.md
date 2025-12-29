# VS Code Extension Guide

## Installation

### From Marketplace

Search for "Gitraki" in VS Code Extensions marketplace.

### From VSIX

```bash
code --install-extension gitraki-vscode-0.1.0.vsix
```

### From Source

```bash
cd gitraki-vscode
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Configuration

Open VS Code Settings (`Cmd/Ctrl + ,`) and search for "Gitraki":

| Setting | Description | Default |
|---------|-------------|---------|
| `gitraki.apiUrl` | Gitraki API URL | `http://localhost:8000/api` |
| `gitraki.apiToken` | API authentication token | - |
| `gitraki.autoRefresh` | Auto-refresh data | `true` |
| `gitraki.refreshInterval` | Refresh interval (seconds) | `300` |

### Setting API Token

1. Get your token from Gitraki web dashboard (Settings > API)
2. Open VS Code Settings
3. Search for "Gitraki API Token"
4. Enter your token

Or in `settings.json`:
```json
{
  "gitraki.apiUrl": "https://api.gitraki.io/api",
  "gitraki.apiToken": "your-api-token"
}
```

## Features

### Sidebar Views

The Gitraki icon in the Activity Bar opens three views:

#### 1. Developer Profile View
- Shows current developer's profile
- Displays name, GitHub username, seniority
- Lists top skills

#### 2. Insights View
- Team health score and grade
- Attrition risk alerts
- Burnout indicators

#### 3. Team Overview
- List of team members
- Top skills across team
- Skill coverage percentages

### Commands

Open Command Palette (`Cmd/Ctrl + Shift + P`) and type "Gitraki":

| Command | Description |
|---------|-------------|
| `Gitraki: Show Developer Profile` | View a developer's profile |
| `Gitraki: Match Task to Developer` | Find best developer for a task |
| `Gitraki: Show Team Skills` | Refresh team skill view |
| `Gitraki: Show Predictive Insights` | Load insights data |
| `Gitraki: Refresh Data` | Refresh all views |
| `Gitraki: Configure API Settings` | Open settings |

### Show Developer Profile

1. Run `Gitraki: Show Developer Profile` command
2. Enter GitHub username
3. Profile appears in sidebar

### Match Task to Developer

1. Run `Gitraki: Match Task to Developer` command
2. Enter task description (e.g., "Fix OAuth bug in login flow")
3. Optionally enter required skills (comma-separated)
4. Select from matched developers
5. View detailed match report in new panel

## Keyboard Shortcuts

Add custom shortcuts in `keybindings.json`:

```json
[
  {
    "key": "ctrl+shift+g p",
    "command": "gitraki.showProfile"
  },
  {
    "key": "ctrl+shift+g m",
    "command": "gitraki.matchTask"
  },
  {
    "key": "ctrl+shift+g r",
    "command": "gitraki.refresh"
  }
]
```

## Status Bar

When connected, you'll see:
- Connection status indicator
- Quick access to commands

## Troubleshooting

### Extension Not Loading

1. Check Output panel (`View > Output > Gitraki`)
2. Verify API URL is correct
3. Check API token is set

### No Data Showing

1. Ensure API server is running
2. Check network connectivity
3. Verify authentication token

### Refresh Not Working

1. Check `gitraki.autoRefresh` setting
2. Manually trigger with `Gitraki: Refresh Data`
3. Check API rate limits

### Performance Issues

1. Increase `gitraki.refreshInterval`
2. Disable `gitraki.autoRefresh` if not needed
3. Check API server performance

## Development

### Building

```bash
cd gitraki-vscode
npm install
npm run compile
```

### Running Tests

```bash
npm test
```

### Packaging

```bash
npm run package
# Creates gitraki-vscode-x.x.x.vsix
```

### Publishing

```bash
vsce publish
```

## API Integration

The extension uses the same REST API as other clients:

- `/developers` - Profile data
- `/analytics` - Team analytics
- `/predictions` - Insights data
- `/hiring/match` - Task matching

See [API Overview](../api/overview.md) for details.
