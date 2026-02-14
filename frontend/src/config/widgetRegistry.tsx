"use client";

import { ComponentType } from "react";
import { WelcomeWidget } from "@/components/dashboard/widgets/WelcomeWidget";
import { QuickStatsWidget } from "@/components/dashboard/widgets/QuickStatsWidget";
import { LanguageProficiencyWidget } from "@/components/dashboard/widgets/LanguageProficiencyWidget";
import { WorkPatternsWidget } from "@/components/dashboard/widgets/WorkPatternsWidget";
import { DomainExpertiseWidget } from "@/components/dashboard/widgets/DomainExpertiseWidget";
import { FrameworksToolsWidget } from "@/components/dashboard/widgets/FrameworksToolsWidget";
import { AIInsightsWidget } from "@/components/dashboard/widgets/AIInsightsWidget";
import { SoftSkillsWidget } from "@/components/dashboard/widgets/SoftSkillsWidget";
import { ComingSoonWidget } from "@/components/dashboard/widgets/ComingSoonWidget";
import {
  TicketStatsWidget,
  SprintOverviewWidget,
  TrackingSummaryWidget,
  CRMPipelineWidget,
  AIAgentsWidget,
  TeamStatsSummaryWidget,
  TasksCompletedChartWidget,
  TicketChartWidget,
  VelocityTrendWidget,
  WorkloadDistributionWidget,
  SprintBurndownWidget,
  BacklogOverviewWidget,
  TicketPipelineWidget,
  BlockersOverviewWidget,
  LeaveBalanceWidget,
  TeamCalendarWidget,
  PendingLeaveApprovalsWidget,
  TeamAvailabilityWidget,
} from "@/components/dashboard/widgets";
import { TaskMatcherCard } from "@/components/TaskMatcherCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const widgetRegistry: Record<string, ComponentType<any>> = {
  // Fully implemented widgets
  welcome: WelcomeWidget,
  quickStats: QuickStatsWidget,
  languageProficiency: LanguageProficiencyWidget,
  workPatterns: WorkPatternsWidget,
  domainExpertise: DomainExpertiseWidget,
  frameworksTools: FrameworksToolsWidget,
  aiInsights: AIInsightsWidget,
  softSkills: SoftSkillsWidget,
  ticketStats: TicketStatsWidget,
  sprintOverview: SprintOverviewWidget,
  trackingSummary: TrackingSummaryWidget,
  crmPipeline: CRMPipelineWidget,
  aiAgents: AIAgentsWidget,
  taskMatcher: TaskMatcherCard,
  // Engineering Manager widgets
  teamStatsSummary: TeamStatsSummaryWidget,
  tasksCompletedChart: TasksCompletedChartWidget,
  ticketChart: TicketChartWidget,
  velocityTrend: VelocityTrendWidget,
  workloadDistribution: WorkloadDistributionWidget,
  sprintBurndown: SprintBurndownWidget,
  // Product Manager widgets
  backlogOverview: BacklogOverviewWidget,
  ticketPipeline: TicketPipelineWidget,
  blockersOverview: BlockersOverviewWidget,
  // Leave & Calendar widgets
  leaveBalance: LeaveBalanceWidget,
  teamCalendar: TeamCalendarWidget,
  pendingLeaveApprovals: PendingLeaveApprovalsWidget,
  teamAvailability: TeamAvailabilityWidget,
};

/**
 * Get the component for a widget ID, falling back to ComingSoonWidget
 */
export function getWidgetComponent(widgetId: string): ComponentType<any> {
  return widgetRegistry[widgetId] || ComingSoonWidget;
}

/**
 * Check if a widget has a full implementation (vs coming soon placeholder)
 */
export function isWidgetImplemented(widgetId: string): boolean {
  return widgetId in widgetRegistry;
}
