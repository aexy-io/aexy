import * as vscode from 'vscode';
import { AexyClient, Developer, SkillHeatmap } from '../api/client';

export class TeamViewProvider implements vscode.TreeDataProvider<TeamItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TeamItem | undefined | null | void> = new vscode.EventEmitter<TeamItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TeamItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private client: AexyClient;
    private developers: Developer[] = [];
    private skillHeatmap: SkillHeatmap | null = null;

    constructor() {
        this.client = new AexyClient();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async loadData(): Promise<void> {
        try {
            this.developers = await this.client.listDevelopers();

            if (this.developers.length > 0) {
                const ids = this.developers.map(d => d.id);
                this.skillHeatmap = await this.client.getSkillHeatmap(ids);
            }

            this.refresh();
        } catch (error) {
            console.error('Failed to load team data:', error);
            vscode.window.showErrorMessage('Failed to load team data');
        }
    }

    getTreeItem(element: TeamItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TeamItem): Promise<TeamItem[]> {
        if (!element) {
            // Root level
            return [
                new TeamItem(
                    'Developers',
                    `${this.developers.length} members`,
                    'section',
                    vscode.TreeItemCollapsibleState.Expanded
                ),
                new TeamItem(
                    'Top Skills',
                    '',
                    'section',
                    vscode.TreeItemCollapsibleState.Expanded
                ),
            ];
        }

        if (element.contextValue === 'section') {
            if (element.label === 'Developers') {
                return this.developers.slice(0, 15).map(dev =>
                    new TeamItem(
                        dev.name || dev.github_username,
                        `@${dev.github_username}`,
                        'developer',
                        vscode.TreeItemCollapsibleState.None
                    )
                );
            } else if (element.label === 'Top Skills') {
                return this.getSkillItems();
            }
        }

        return [];
    }

    private getSkillItems(): TeamItem[] {
        if (!this.skillHeatmap) {
            return [new TeamItem('Loading...', '', 'loading')];
        }

        return this.skillHeatmap.skills.slice(0, 10).map(skill => {
            const level = Math.round(skill.average_level);
            const coverage = Math.round(skill.coverage_percent);
            return new TeamItem(
                skill.name,
                `Level: ${level}% | Coverage: ${coverage}%`,
                'skill',
                vscode.TreeItemCollapsibleState.None
            );
        });
    }
}

export class TeamItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);

        if (value) {
            this.description = value;
        }

        switch (contextValue) {
            case 'section':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'developer':
                this.iconPath = new vscode.ThemeIcon('person');
                break;
            case 'skill':
                this.iconPath = new vscode.ThemeIcon('symbol-keyword');
                break;
            case 'loading':
                this.iconPath = new vscode.ThemeIcon('loading~spin');
                break;
        }
    }
}
