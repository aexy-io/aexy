import * as vscode from 'vscode';
import { ProfileViewProvider } from './views/profileView';
import { InsightsViewProvider } from './views/insightsView';
import { TeamViewProvider } from './views/teamView';
import { showProfile } from './commands/showProfile';
import { matchTask } from './commands/matchTask';

let refreshInterval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Devograph extension is now active');

    // Initialize view providers
    const profileProvider = new ProfileViewProvider();
    const insightsProvider = new InsightsViewProvider();
    const teamProvider = new TeamViewProvider();

    // Register tree data providers
    vscode.window.registerTreeDataProvider('devograph.profile', profileProvider);
    vscode.window.registerTreeDataProvider('devograph.insights', insightsProvider);
    vscode.window.registerTreeDataProvider('devograph.team', teamProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('devograph.showProfile', () => showProfile(profileProvider)),
        vscode.commands.registerCommand('devograph.matchTask', matchTask),
        vscode.commands.registerCommand('devograph.teamSkills', async () => {
            await teamProvider.loadData();
            vscode.window.showInformationMessage('Team skills loaded');
        }),
        vscode.commands.registerCommand('devograph.insights', async () => {
            await insightsProvider.loadTeamHealth();
            vscode.window.showInformationMessage('Insights loaded');
        }),
        vscode.commands.registerCommand('devograph.refresh', async () => {
            await Promise.all([
                teamProvider.loadData(),
                insightsProvider.loadTeamHealth(),
            ]);
            profileProvider.refresh();
            vscode.window.showInformationMessage('Devograph data refreshed');
        }),
        vscode.commands.registerCommand('devograph.configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'devograph');
        })
    );

    // Load initial data
    loadInitialData(teamProvider, insightsProvider);

    // Setup auto-refresh if enabled
    setupAutoRefresh(context, teamProvider, insightsProvider, profileProvider);

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('devograph')) {
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
    const config = vscode.workspace.getConfiguration('devograph');
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
