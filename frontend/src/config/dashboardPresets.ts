/**
 * Dashboard Presets Configuration
 * Defines persona-based dashboard configurations
 */

export type PresetType = 'developer' | 'manager' | 'product' | 'hr' | 'support' | 'sales' | 'admin' | 'custom';

export interface DashboardPreset {
  id: PresetType;
  name: string;
  description: string;
  icon: string;
  color: string;
  widgets: string[];
}

export const DASHBOARD_PRESETS: Record<PresetType, DashboardPreset> = {
  developer: {
    id: 'developer',
    name: 'Developer',
    description: 'Personal skills, insights, and growth tracking',
    icon: 'Code',
    color: 'from-blue-500 to-blue-600',
    widgets: [
      'welcome',
      'quickStats',
      'languageProficiency',
      'workPatterns',
      'domainExpertise',
      'frameworksTools',
      'aiInsights',
      'softSkills',
      'growthTrajectory',
      'peerBenchmark',
      'myGoals',
      'performanceReviews',
      'learningPath',
    ],
  },
  manager: {
    id: 'manager',
    name: 'Engineering Manager',
    description: 'Team insights, sprint planning, and performance reviews',
    icon: 'Users',
    color: 'from-green-500 to-green-600',
    widgets: [
      'welcome',
      'quickStats',
      'teamOverview',
      'sprintOverview',
      'trackingSummary',
      'taskMatcher',
      'peerBenchmark',
      'aiInsights',
      'performanceReviews',
      'myGoals',
    ],
  },
  product: {
    id: 'product',
    name: 'Product Manager',
    description: 'Sprint planning, tracking, and documentation',
    icon: 'Target',
    color: 'from-purple-500 to-purple-600',
    widgets: [
      'welcome',
      'sprintOverview',
      'trackingSummary',
      'recentDocs',
      'teamOverview',
      'myGoals',
      'upcomingDeadlines',
    ],
  },
  hr: {
    id: 'hr',
    name: 'HR / People Ops',
    description: 'Hiring pipeline, reviews, and organizational health',
    icon: 'Heart',
    color: 'from-rose-500 to-rose-600',
    widgets: [
      'welcome',
      'hiringPipeline',
      'candidateStats',
      'softSkills',
      'performanceReviews',
      'teamOverview',
      'pendingReviews',
    ],
  },
  support: {
    id: 'support',
    name: 'Support / Customer Success',
    description: 'Tickets, SLAs, and customer forms',
    icon: 'Ticket',
    color: 'from-pink-500 to-pink-600',
    widgets: [
      'welcome',
      'ticketStats',
      'slaOverview',
      'recentTickets',
      'formSubmissions',
      'crmQuickView',
    ],
  },
  sales: {
    id: 'sales',
    name: 'Sales',
    description: 'CRM pipeline, deals, and customer interactions',
    icon: 'Building2',
    color: 'from-cyan-500 to-cyan-600',
    widgets: [
      'welcome',
      'crmPipeline',
      'dealStats',
      'recentDeals',
      'formSubmissions',
      'myGoals',
    ],
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    description: 'Organization-wide metrics and system overview',
    icon: 'Settings',
    color: 'from-slate-500 to-slate-600',
    widgets: [
      'welcome',
      'orgMetrics',
      'teamOverview',
      'hiringPipeline',
      'ticketStats',
      'systemHealth',
    ],
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    description: 'Your personalized dashboard configuration',
    icon: 'Sliders',
    color: 'from-amber-500 to-amber-600',
    widgets: [], // Custom starts empty, user adds widgets
  },
};

/**
 * Get preset by ID
 */
export function getPresetById(presetId: PresetType): DashboardPreset {
  return DASHBOARD_PRESETS[presetId] || DASHBOARD_PRESETS.developer;
}

/**
 * Get all presets as array
 */
export function getAllPresets(): DashboardPreset[] {
  return Object.values(DASHBOARD_PRESETS);
}

/**
 * Get default widgets for a preset
 */
export function getDefaultWidgetsForPreset(presetId: PresetType): string[] {
  return DASHBOARD_PRESETS[presetId]?.widgets || DASHBOARD_PRESETS.developer.widgets;
}
