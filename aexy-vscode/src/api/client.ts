import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';

export interface Developer {
    id: string;
    github_username: string;
    name?: string;
    email?: string;
    seniority_level?: string;
    skills: string[];
    location?: string;
}

export interface Team {
    id: string;
    name: string;
    description?: string;
    developer_ids: string[];
}

export interface SkillHeatmap {
    skills: Array<{
        name: string;
        average_level: number;
        coverage_percent: number;
        expert_count: number;
    }>;
}

export interface AttritionRisk {
    risk_score: number;
    risk_level: string;
    confidence: number;
    factors: Array<{
        factor: string;
        weight: number;
        evidence: string;
        trend: string;
    }>;
    recommendations: string[];
}

export interface TeamHealth {
    health_score: number;
    health_grade: string;
    strengths: string[];
    risks: Array<{
        risk: string;
        severity: string;
        mitigation: string;
    }>;
    recommendations: string[];
}

export interface TaskMatch {
    developer_id: string;
    github_username: string;
    name?: string;
    score: number;
    matching_skills: string[];
    reasoning: string;
}

export class AexyClient {
    private client: AxiosInstance;

    constructor() {
        const config = vscode.workspace.getConfiguration('aexy');
        const baseURL = config.get<string>('apiUrl') || 'http://localhost:8000/api';
        const token = config.get<string>('apiToken') || '';

        this.client = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
        });
    }

    async listDevelopers(): Promise<Developer[]> {
        const response = await this.client.get('/developers');
        return response.data;
    }

    async getDeveloper(id: string): Promise<Developer> {
        const response = await this.client.get(`/developers/${id}`);
        return response.data;
    }

    async getDeveloperByUsername(username: string): Promise<Developer | null> {
        try {
            const response = await this.client.get(`/developers/github/${username}`);
            return response.data;
        } catch {
            return null;
        }
    }

    async getDeveloperProfile(id: string): Promise<any> {
        const response = await this.client.get(`/developers/${id}/profile`);
        return response.data;
    }

    async listTeams(): Promise<Team[]> {
        const response = await this.client.get('/teams');
        return response.data;
    }

    async getTeam(id: string): Promise<Team> {
        const response = await this.client.get(`/teams/${id}`);
        return response.data;
    }

    async getSkillHeatmap(developerIds: string[]): Promise<SkillHeatmap> {
        const response = await this.client.post('/analytics/heatmap/skills', {
            developer_ids: developerIds,
        });
        return response.data;
    }

    async getAttritionRisk(developerId: string): Promise<AttritionRisk> {
        const response = await this.client.get(`/predictions/attrition/${developerId}`);
        return response.data;
    }

    async getTeamHealth(developerIds: string[]): Promise<TeamHealth> {
        const response = await this.client.post('/predictions/team-health', {
            developer_ids: developerIds,
        });
        return response.data;
    }

    async matchTask(description: string, skills?: string[]): Promise<{ matches: TaskMatch[] }> {
        const response = await this.client.post('/hiring/match', {
            description,
            required_skills: skills || [],
        });
        return response.data;
    }
}
