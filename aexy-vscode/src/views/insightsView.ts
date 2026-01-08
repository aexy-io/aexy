import * as vscode from 'vscode';
import { AexyClient, TeamHealth, AttritionRisk } from '../api/client';

export class InsightsViewProvider implements vscode.TreeDataProvider<InsightItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<InsightItem | undefined | null | void> = new vscode.EventEmitter<InsightItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<InsightItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private client: AexyClient;
    private teamHealth: TeamHealth | null = null;
    private attritionRisks: Map<string, AttritionRisk> = new Map();

    constructor() {
        this.client = new AexyClient();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async loadTeamHealth(): Promise<void> {
        try {
            const developers = await this.client.listDevelopers();
            if (developers.length > 0) {
                const ids = developers.map(d => d.id);
                this.teamHealth = await this.client.getTeamHealth(ids);
                this.refresh();
            }
        } catch (error) {
            console.error('Failed to load team health:', error);
        }
    }

    async loadAttritionRisk(developerId: string, username: string): Promise<void> {
        try {
            const risk = await this.client.getAttritionRisk(developerId);
            this.attritionRisks.set(username, risk);
            this.refresh();
        } catch (error) {
            console.error(`Failed to load attrition risk for ${username}:`, error);
        }
    }

    getTreeItem(element: InsightItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: InsightItem): Promise<InsightItem[]> {
        if (!element) {
            // Root level
            const items: InsightItem[] = [];

            // Team Health section
            items.push(new InsightItem(
                'Team Health',
                '',
                'section',
                vscode.TreeItemCollapsibleState.Expanded
            ));

            // Attrition Risks section
            if (this.attritionRisks.size > 0) {
                items.push(new InsightItem(
                    'Attrition Risks',
                    '',
                    'section',
                    vscode.TreeItemCollapsibleState.Expanded
                ));
            }

            return items;
        }

        if (element.contextValue === 'section') {
            if (element.label === 'Team Health') {
                return this.getTeamHealthItems();
            } else if (element.label === 'Attrition Risks') {
                return this.getAttritionItems();
            }
        }

        return [];
    }

    private getTeamHealthItems(): InsightItem[] {
        if (!this.teamHealth) {
            return [new InsightItem('Loading...', '', 'loading')];
        }

        const items: InsightItem[] = [];

        // Health score
        const scoreIcon = this.getHealthIcon(this.teamHealth.health_grade);
        items.push(new InsightItem(
            `Score: ${Math.round(this.teamHealth.health_score * 100)}%`,
            this.teamHealth.health_grade,
            'health-score',
            vscode.TreeItemCollapsibleState.None,
            scoreIcon
        ));

        // Strengths
        if (this.teamHealth.strengths.length > 0) {
            items.push(new InsightItem(
                'Strengths',
                `${this.teamHealth.strengths.length} items`,
                'health-strengths',
                vscode.TreeItemCollapsibleState.Collapsed
            ));
        }

        // Risks
        if (this.teamHealth.risks.length > 0) {
            items.push(new InsightItem(
                'Risks',
                `${this.teamHealth.risks.length} items`,
                'health-risks',
                vscode.TreeItemCollapsibleState.Collapsed
            ));
        }

        return items;
    }

    private getAttritionItems(): InsightItem[] {
        const items: InsightItem[] = [];

        for (const [username, risk] of this.attritionRisks) {
            const icon = this.getRiskIcon(risk.risk_level);
            items.push(new InsightItem(
                `@${username}`,
                `${risk.risk_level} (${Math.round(risk.risk_score * 100)}%)`,
                'attrition-risk',
                vscode.TreeItemCollapsibleState.None,
                icon
            ));
        }

        return items;
    }

    private getHealthIcon(grade: string): vscode.ThemeIcon {
        switch (grade) {
            case 'A':
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            case 'B':
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            case 'C':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
            case 'D':
            case 'F':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }

    private getRiskIcon(level: string): vscode.ThemeIcon {
        switch (level.toLowerCase()) {
            case 'critical':
            case 'high':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'));
            case 'moderate':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
            case 'low':
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }
}

export class InsightItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        icon?: vscode.ThemeIcon
    ) {
        super(label, collapsibleState);

        if (value) {
            this.description = value;
        }

        if (icon) {
            this.iconPath = icon;
        } else {
            switch (contextValue) {
                case 'section':
                    this.iconPath = new vscode.ThemeIcon('folder');
                    break;
                case 'loading':
                    this.iconPath = new vscode.ThemeIcon('loading~spin');
                    break;
            }
        }
    }
}
