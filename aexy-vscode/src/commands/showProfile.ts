import * as vscode from 'vscode';
import { AexyClient } from '../api/client';
import { ProfileViewProvider } from '../views/profileView';

export async function showProfile(profileProvider: ProfileViewProvider): Promise<void> {
    const username = await vscode.window.showInputBox({
        prompt: 'Enter GitHub username',
        placeHolder: '@username',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Username is required';
            }
            return null;
        },
    });

    if (!username) {
        return;
    }

    const cleanUsername = username.replace('@', '').trim();

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Loading profile for @${cleanUsername}...`,
                cancellable: false,
            },
            async () => {
                await profileProvider.setDeveloper(cleanUsername);
            }
        );

        vscode.window.showInformationMessage(`Loaded profile for @${cleanUsername}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load profile: ${error}`);
    }
}

export async function showProfileFromGit(): Promise<void> {
    // Try to detect the current user from git config
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }

    try {
        const terminal = vscode.window.createTerminal({
            name: 'Aexy',
            hideFromUser: true,
        });

        // This is a placeholder - in production, you'd want to use a proper
        // git library or shell execution to get the username
        vscode.window.showInformationMessage(
            'Use "Aexy: Show Developer Profile" command and enter a username'
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to detect git user: ${error}`);
    }
}
