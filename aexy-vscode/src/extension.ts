import * as vscode from 'vscode';
import { ProfileViewProvider } from './views/profileView';
import { InsightsViewProvider } from './views/insightsView';
import { TeamViewProvider } from './views/teamView';
import { showProfile } from './commands/showProfile';
import { matchTask } from './commands/matchTask';

let refreshInterval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Aexy extension is now active');

    // Initialize view providers
    const profileProvider = new ProfileViewProvider();
    const insightsProvider = new InsightsViewProvider();
    const teamProvider = new TeamViewProvider();

    // Register tree data providers
    vscode.window.registerTreeDataProvider('aexy.profile', profileProvider);
    vscode.window.registerTreeDataProvider('aexy.insights', insightsProvider);
    vscode.window.registerTreeDataProvider('aexy.team', teamProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('aexy.showProfile', () => showProfile(profileProvider)),
        vscode.commands.registerCommand('aexy.matchTask', matchTask),
        vscode.commands.registerCommand('aexy.teamSkills', async () => {
            await teamProvider.loadData();
            vscode.window.showInformationMessage('Team skills loaded');
        }),
        vscode.commands.registerCommand('aexy.insights', async () => {
            await insightsProvider.loadTeamHealth();
            vscode.window.showInformationMessage('Insights loaded');
        }),
        vscode.commands.registerCommand('aexy.refresh', async () => {
            await Promise.all([
                teamProvider.loadData(),
                insightsProvider.loadTeamHealth(),
            ]);
            profileProvider.refresh();
            vscode.window.showInformationMessage('Aexy data refreshed');
        }),
        vscode.commands.registerCommand('aexy.configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'aexy');
        })
    );

    // Load initial data
    loadInitialData(teamProvider, insightsProvider);

    // Setup auto-refresh if enabled
    setupAutoRefresh(context, teamProvider, insightsProvider, profileProvider);

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aexy')) {
                // Re-setup auto-refresh
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                }
                setupAutoRefresh(context, teamProvider, insightsProvider, profileProvider);
            }
        })
    );
}

async function loadInitialData(
    teamProvider: TeamViewProvider,
    insightsProvider: InsightsViewProvider
): Promise<void> {
    try {
        await Promise.all([
            teamProvider.loadData(),
            insightsProvider.loadTeamHealth(),
        ]);
    } catch (error) {
        console.error('Failed to load initial data:', error);
        // Don't show error on startup - user might not have configured the API yet
    }
}

function setupAutoRefresh(
    context: vscode.ExtensionContext,
    teamProvider: TeamViewProvider,
    insightsProvider: InsightsViewProvider,
    profileProvider: ProfileViewProvider
): void {
    const config = vscode.workspace.getConfiguration('aexy');
    const autoRefresh = config.get<boolean>('autoRefresh', true);
    const intervalSeconds = config.get<number>('refreshInterval', 300);

    if (autoRefresh && intervalSeconds > 0) {
        refreshInterval = setInterval(async () => {
            try {
                await Promise.all([
                    teamProvider.loadData(),
                    insightsProvider.loadTeamHealth(),
                ]);
                profileProvider.refresh();
            } catch (error) {
                console.error('Auto-refresh failed:', error);
            }
        }, intervalSeconds * 1000);

        context.subscriptions.push({
            dispose: () => {
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                }
            },
        });
    }
}

export function deactivate() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}
