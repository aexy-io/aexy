/**
 * Dashboard Widget Registry
 * Defines all available widgets with metadata for the customizable dashboard
 */

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';
export type PersonaType = 'developer' | 'manager' | 'product' | 'hr' | 'support' | 'sales' | 'admin' | 'all';

export interface WidgetDefinition {
  id: string;
  name: string;
  category: string;
  personas: PersonaType[];
  defaultSize: WidgetSize;
  icon: string;
  description?: string;
}

export const DASHBOARD_WIDGETS: Record<string, WidgetDefinition> = {
  // === CORE / PROFILE ===
  welcome: {
    id: 'welcome',
    name: 'Welcome',
    category: 'profile',
    personas: ['all'],
    defaultSize: 'full',
    icon: 'User',
    description: 'Welcome message with quick actions',
  },
  quickStats: {
    id: 'quickStats',
    name: 'Quick Stats',
    category: 'stats',
    personas: ['all'],
    defaultSize: 'full',
    icon: 'BarChart3',
    description: 'Key metrics at a glance',
  },
  myGoals: {
    id: 'myGoals',
    name: 'My Goals',
    category: 'goals',
    personas: ['all'],
    defaultSize: 'medium',
    icon: 'Target',
    description: 'Personal goals and progress',
  },

  // === DEVELOPER SKILLS ===
  languageProficiency: {
    id: 'languageProficiency',
    name: 'Language Proficiency',
    category: 'skills',
    personas: ['developer', 'manager'],
    defaultSize: 'large',
    icon: 'Code',
    description: 'Programming language expertise',
  },
  workPatterns: {
    id: 'workPatterns',
    name: 'Work Patterns',
    category: 'analytics',
    personas: ['developer', 'manager'],
    defaultSize: 'small',
    icon: 'Activity',
    description: 'Productivity and work style analysis',
  },
  domainExpertise: {
    id: 'domainExpertise',
    name: 'Domain Expertise',
    category: 'skills',
    personas: ['developer', 'manager', 'hr'],
    defaultSize: 'medium',
    icon: 'Layers',
    description: 'Areas of technical expertise',
  },
  frameworksTools: {
    id: 'frameworksTools',
    name: 'Frameworks & Tools',
    category: 'skills',
    personas: ['developer'],
    defaultSize: 'medium',
    icon: 'Wrench',
    description: 'Framework and tool proficiency',
  },

  // === AI INSIGHTS ===
  aiInsights: {
    id: 'aiInsights',
    name: 'AI Insights',
    category: 'ai',
    personas: ['all'],
    defaultSize: 'medium',
    icon: 'Sparkles',
    description: 'AI-powered skill analysis',
  },
  softSkills: {
    id: 'softSkills',
    name: 'Soft Skills',
    category: 'ai',
    personas: ['developer', 'manager', 'hr'],
    defaultSize: 'medium',
    icon: 'Heart',
    description: 'Communication and collaboration scores',
  },
  growthTrajectory: {
    id: 'growthTrajectory',
    name: 'Growth Trajectory',
    category: 'ai',
    personas: ['developer', 'manager'],
    defaultSize: 'medium',
    icon: 'TrendingUp',
    description: 'Skill growth over time',
  },
  peerBenchmark: {
    id: 'peerBenchmark',
    name: 'Peer Benchmark',
    category: 'analytics',
    personas: ['developer', 'manager'],
    defaultSize: 'medium',
    icon: 'Users',
    description: 'Compare with peer performance',
  },
  taskMatcher: {
    id: 'taskMatcher',
    name: 'Task Matcher',
    category: 'tools',
    personas: ['manager', 'hr'],
    defaultSize: 'medium',
    icon: 'Shuffle',
    description: 'Match tasks to team members',
  },

  // === TRACKING ===
  trackingSummary: {
    id: 'trackingSummary',
    name: 'Tracking Summary',
    category: 'tracking',
    personas: ['developer', 'manager', 'product'],
    defaultSize: 'medium',
    icon: 'Target',
    description: 'Daily tracking overview',
  },
  standupStatus: {
    id: 'standupStatus',
    name: 'Standup Status',
    category: 'tracking',
    personas: ['developer', 'manager'],
    defaultSize: 'small',
    icon: 'CheckCircle',
    description: 'Daily standup submission status',
  },
  blockersOverview: {
    id: 'blockersOverview',
    name: 'Blockers Overview',
    category: 'tracking',
    personas: ['manager', 'product'],
    defaultSize: 'medium',
    icon: 'AlertTriangle',
    description: 'Active blockers and issues',
  },
  timeTracking: {
    id: 'timeTracking',
    name: 'Time Tracking',
    category: 'tracking',
    personas: ['developer', 'manager'],
    defaultSize: 'small',
    icon: 'Clock',
    description: 'Time logged today',
  },

  // === PLANNING / SPRINTS ===
  sprintOverview: {
    id: 'sprintOverview',
    name: 'Sprint Overview',
    category: 'planning',
    personas: ['manager', 'product', 'developer'],
    defaultSize: 'large',
    icon: 'Calendar',
    description: 'Current sprint progress',
  },
  sprintBurndown: {
    id: 'sprintBurndown',
    name: 'Sprint Burndown',
    category: 'planning',
    personas: ['manager', 'product'],
    defaultSize: 'medium',
    icon: 'TrendingDown',
    description: 'Sprint burndown chart',
  },
  upcomingDeadlines: {
    id: 'upcomingDeadlines',
    name: 'Upcoming Deadlines',
    category: 'planning',
    personas: ['all'],
    defaultSize: 'small',
    icon: 'Clock',
    description: 'Tasks due soon',
  },

  // === TICKETS ===
  ticketStats: {
    id: 'ticketStats',
    name: 'Ticket Stats',
    category: 'tickets',
    personas: ['support', 'admin'],
    defaultSize: 'medium',
    icon: 'Ticket',
    description: 'Ticket volume and resolution',
  },
  slaOverview: {
    id: 'slaOverview',
    name: 'SLA Overview',
    category: 'tickets',
    personas: ['support', 'admin'],
    defaultSize: 'medium',
    icon: 'AlertCircle',
    description: 'SLA compliance metrics',
  },
  recentTickets: {
    id: 'recentTickets',
    name: 'Recent Tickets',
    category: 'tickets',
    personas: ['support'],
    defaultSize: 'large',
    icon: 'List',
    description: 'Latest ticket activity',
  },
  ticketsByPriority: {
    id: 'ticketsByPriority',
    name: 'Tickets by Priority',
    category: 'tickets',
    personas: ['support', 'admin'],
    defaultSize: 'medium',
    icon: 'Flag',
    description: 'Tickets grouped by priority',
  },

  // === FORMS ===
  formSubmissions: {
    id: 'formSubmissions',
    name: 'Form Submissions',
    category: 'forms',
    personas: ['support', 'sales'],
    defaultSize: 'medium',
    icon: 'FormInput',
    description: 'Recent form submissions',
  },
  recentForms: {
    id: 'recentForms',
    name: 'Recent Forms',
    category: 'forms',
    personas: ['support', 'sales'],
    defaultSize: 'medium',
    icon: 'FileText',
    description: 'Recently created forms',
  },

  // === DOCS ===
  recentDocs: {
    id: 'recentDocs',
    name: 'Recent Docs',
    category: 'docs',
    personas: ['all'],
    defaultSize: 'medium',
    icon: 'FileText',
    description: 'Recently updated documents',
  },
  docActivity: {
    id: 'docActivity',
    name: 'Doc Activity',
    category: 'docs',
    personas: ['manager', 'product'],
    defaultSize: 'small',
    icon: 'Activity',
    description: 'Documentation activity feed',
  },

  // === REVIEWS ===
  performanceReviews: {
    id: 'performanceReviews',
    name: 'Performance Reviews',
    category: 'reviews',
    personas: ['all'],
    defaultSize: 'medium',
    icon: 'ClipboardCheck',
    description: 'Review cycle status',
  },
  pendingReviews: {
    id: 'pendingReviews',
    name: 'Pending Reviews',
    category: 'reviews',
    personas: ['manager', 'hr'],
    defaultSize: 'medium',
    icon: 'Clock',
    description: 'Reviews awaiting completion',
  },
  reviewCycle: {
    id: 'reviewCycle',
    name: 'Review Cycle Progress',
    category: 'reviews',
    personas: ['hr', 'admin'],
    defaultSize: 'medium',
    icon: 'RefreshCw',
    description: 'Organization review progress',
  },

  // === LEARNING ===
  learningPath: {
    id: 'learningPath',
    name: 'Learning Path',
    category: 'learning',
    personas: ['developer'],
    defaultSize: 'medium',
    icon: 'GraduationCap',
    description: 'Personalized learning journey',
  },
  skillGaps: {
    id: 'skillGaps',
    name: 'Skill Gaps',
    category: 'learning',
    personas: ['developer', 'manager'],
    defaultSize: 'medium',
    icon: 'AlertCircle',
    description: 'Areas for improvement',
  },

  // === HIRING ===
  hiringPipeline: {
    id: 'hiringPipeline',
    name: 'Hiring Pipeline',
    category: 'hiring',
    personas: ['hr', 'manager'],
    defaultSize: 'large',
    icon: 'Users',
    description: 'Candidate pipeline overview',
  },
  candidateStats: {
    id: 'candidateStats',
    name: 'Candidate Stats',
    category: 'hiring',
    personas: ['hr'],
    defaultSize: 'medium',
    icon: 'BarChart3',
    description: 'Hiring metrics and stats',
  },
  openPositions: {
    id: 'openPositions',
    name: 'Open Positions',
    category: 'hiring',
    personas: ['hr', 'manager'],
    defaultSize: 'medium',
    icon: 'Briefcase',
    description: 'Active job openings',
  },
  interviewSchedule: {
    id: 'interviewSchedule',
    name: 'Interview Schedule',
    category: 'hiring',
    personas: ['hr', 'manager'],
    defaultSize: 'medium',
    icon: 'Calendar',
    description: 'Upcoming interviews',
  },

  // === CRM ===
  crmPipeline: {
    id: 'crmPipeline',
    name: 'CRM Pipeline',
    category: 'crm',
    personas: ['sales'],
    defaultSize: 'large',
    icon: 'Building2',
    description: 'Sales pipeline overview',
  },
  dealStats: {
    id: 'dealStats',
    name: 'Deal Stats',
    category: 'crm',
    personas: ['sales', 'admin'],
    defaultSize: 'medium',
    icon: 'DollarSign',
    description: 'Deal metrics and revenue',
  },
  recentDeals: {
    id: 'recentDeals',
    name: 'Recent Deals',
    category: 'crm',
    personas: ['sales'],
    defaultSize: 'medium',
    icon: 'TrendingUp',
    description: 'Latest deal activity',
  },
  crmQuickView: {
    id: 'crmQuickView',
    name: 'CRM Quick View',
    category: 'crm',
    personas: ['support', 'sales'],
    defaultSize: 'small',
    icon: 'Eye',
    description: 'Quick CRM access',
  },

  // === TEAM / ORG ===
  teamOverview: {
    id: 'teamOverview',
    name: 'Team Overview',
    category: 'team',
    personas: ['manager', 'hr', 'admin'],
    defaultSize: 'large',
    icon: 'Users',
    description: 'Team status and health',
  },
  teamActivity: {
    id: 'teamActivity',
    name: 'Team Activity',
    category: 'team',
    personas: ['manager'],
    defaultSize: 'medium',
    icon: 'Activity',
    description: 'Team activity feed',
  },

  // === ADMIN ===
  orgMetrics: {
    id: 'orgMetrics',
    name: 'Organization Metrics',
    category: 'admin',
    personas: ['admin'],
    defaultSize: 'full',
    icon: 'BarChart3',
    description: 'Organization-wide KPIs',
  },
  systemHealth: {
    id: 'systemHealth',
    name: 'System Health',
    category: 'admin',
    personas: ['admin'],
    defaultSize: 'medium',
    icon: 'Activity',
    description: 'System status and health',
  },
};

export interface WidgetCategory {
  id: string;
  name: string;
  icon: string;
}

export const WIDGET_CATEGORIES: Record<string, WidgetCategory> = {
  profile: { id: 'profile', name: 'Profile & Goals', icon: 'User' },
  stats: { id: 'stats', name: 'Statistics', icon: 'BarChart3' },
  goals: { id: 'goals', name: 'Goals', icon: 'Target' },
  skills: { id: 'skills', name: 'Developer Skills', icon: 'Code' },
  analytics: { id: 'analytics', name: 'Analytics', icon: 'Activity' },
  ai: { id: 'ai', name: 'AI Insights', icon: 'Sparkles' },
  tools: { id: 'tools', name: 'Tools', icon: 'Wrench' },
  tracking: { id: 'tracking', name: 'Tracking', icon: 'Target' },
  planning: { id: 'planning', name: 'Planning & Sprints', icon: 'Calendar' },
  tickets: { id: 'tickets', name: 'Tickets', icon: 'Ticket' },
  forms: { id: 'forms', name: 'Forms', icon: 'FormInput' },
  docs: { id: 'docs', name: 'Documentation', icon: 'FileText' },
  reviews: { id: 'reviews', name: 'Reviews', icon: 'ClipboardCheck' },
  learning: { id: 'learning', name: 'Learning', icon: 'GraduationCap' },
  hiring: { id: 'hiring', name: 'Hiring', icon: 'Users' },
  crm: { id: 'crm', name: 'CRM', icon: 'Building2' },
  team: { id: 'team', name: 'Team', icon: 'Users' },
  admin: { id: 'admin', name: 'Admin', icon: 'Settings' },
};

/**
 * Get widgets by category
 */
export function getWidgetsByCategory(categoryId: string): WidgetDefinition[] {
  return Object.values(DASHBOARD_WIDGETS).filter(w => w.category === categoryId);
}

/**
 * Get widgets available for a specific persona
 */
export function getWidgetsForPersona(persona: PersonaType): WidgetDefinition[] {
  return Object.values(DASHBOARD_WIDGETS).filter(
    w => w.personas.includes('all') || w.personas.includes(persona)
  );
}

/**
 * Get widget by ID
 */
export function getWidgetById(widgetId: string): WidgetDefinition | undefined {
  return DASHBOARD_WIDGETS[widgetId];
}
