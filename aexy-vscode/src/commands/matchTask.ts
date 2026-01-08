import * as vscode from 'vscode';
import { AexyClient, TaskMatch } from '../api/client';

export async function matchTask(): Promise<void> {
    const description = await vscode.window.showInputBox({
        prompt: 'Describe the task',
        placeHolder: 'e.g., Fix authentication bug in OAuth flow',
        validateInput: (value) => {
            if (!value || value.trim().length < 10) {
                return 'Please provide a more detailed description (at least 10 characters)';
            }
            return null;
        },
    });

    if (!description) {
        return;
    }

    // Optional: ask for required skills
    const skillsInput = await vscode.window.showInputBox({
        prompt: 'Required skills (optional)',
        placeHolder: 'e.g., python, oauth, security (comma-separated)',
    });

    const skills = skillsInput
        ? skillsInput.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
        : [];

    try {
        const client = new AexyClient();

        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Finding best matches...',
                cancellable: false,
            },
            async () => {
                return await client.matchTask(description, skills);
            }
        );

        if (!result.matches || result.matches.length === 0) {
            vscode.window.showInformationMessage('No matching developers found');
            return;
        }

        // Show results in a quick pick
        const items = result.matches.slice(0, 10).map((match, index) => ({
            label: `${index + 1}. @${match.github_username}`,
            description: `${Math.round(match.score * 100)}% match`,
            detail: `Skills: ${match.matching_skills.slice(0, 5).join(', ')}`,
            match,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a developer to view details',
            title: `Task Matches for: ${description.substring(0, 50)}...`,
        });

        if (selected) {
            showMatchDetails(selected.match, description);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to match task: ${error}`);
    }
}

function showMatchDetails(match: TaskMatch, description: string): void {
    const panel = vscode.window.createWebviewPanel(
        'aexyMatch',
        `Match: @${match.github_username}`,
        vscode.ViewColumn.One,
        {}
    );

    panel.webview.html = getMatchWebviewContent(match, description);
}

function getMatchWebviewContent(match: TaskMatch, description: string): string {
    const scorePercentage = Math.round(match.score * 100);
    const scoreColor = scorePercentage >= 80 ? '#4CAF50' : scorePercentage >= 60 ? '#FFC107' : '#FF5722';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Match</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .developer-name {
            font-size: 24px;
            font-weight: bold;
        }
        .score {
            font-size: 36px;
            font-weight: bold;
            color: ${scoreColor};
        }
        .section {
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }
        .skill-tag {
            display: inline-block;
            padding: 4px 8px;
            margin: 2px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 4px;
            font-size: 12px;
        }
        .reasoning {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 10px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="developer-name">@${match.github_username}</div>
        ${match.name ? `<div>${match.name}</div>` : ''}
    </div>

    <div class="section">
        <div class="section-title">Match Score</div>
        <div class="score">${scorePercentage}%</div>
    </div>

    <div class="section">
        <div class="section-title">Task</div>
        <p>${description}</p>
    </div>

    <div class="section">
        <div class="section-title">Matching Skills</div>
        <div>
            ${match.matching_skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
        </div>
    </div>

    ${match.reasoning ? `
    <div class="section">
        <div class="section-title">Reasoning</div>
        <div class="reasoning">${match.reasoning}</div>
    </div>
    ` : ''}
</body>
</html>`;
}
