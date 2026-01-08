import * as vscode from 'vscode';
import { AexyClient, Developer } from '../api/client';

export class ProfileViewProvider implements vscode.TreeDataProvider<ProfileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProfileItem | undefined | null | void> = new vscode.EventEmitter<ProfileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProfileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private client: AexyClient;
    private currentDeveloper: Developer | null = null;

    constructor() {
        this.client = new AexyClient();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async setDeveloper(username: string): Promise<void> {
        try {
            this.currentDeveloper = await this.client.getDeveloperByUsername(username);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch developer: ${username}`);
        }
    }

    getTreeItem(element: ProfileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ProfileItem): Promise<ProfileItem[]> {
        if (!this.currentDeveloper) {
            return [new ProfileItem('No developer selected', '', 'info')];
        }

        if (!element) {
            // Root level
            return [
                new ProfileItem('Info', '', 'section', vscode.TreeItemCollapsibleState.Expanded),
                new ProfileItem('Skills', '', 'section', vscode.TreeItemCollapsibleState.Expanded),
            ];
        }

        if (element.contextValue === 'section') {
            if (element.label === 'Info') {
                return [
                    new ProfileItem('Name', this.currentDeveloper.name || 'N/A', 'field'),
                    new ProfileItem('GitHub', `@${this.currentDeveloper.github_username}`, 'field'),
                    new ProfileItem('Seniority', this.currentDeveloper.seniority_level || 'Unknown', 'field'),
                    new ProfileItem('Location', this.currentDeveloper.location || 'N/A', 'field'),
                ];
            } else if (element.label === 'Skills') {
                return this.currentDeveloper.skills.slice(0, 10).map(
                    skill => new ProfileItem(skill, '', 'skill')
                );
            }
        }

        return [];
    }
}

export class ProfileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);

        if (value && contextValue === 'field') {
            this.description = value;
        }

        switch (contextValue) {
            case 'section':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'skill':
                this.iconPath = new vscode.ThemeIcon('symbol-keyword');
                break;
            case 'field':
                this.iconPath = new vscode.ThemeIcon('symbol-property');
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}
