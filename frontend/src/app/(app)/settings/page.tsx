"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Settings,
  FolderGit2,
  Building2,
  FolderKanban,
  ListChecks,
  Link2,
  CreditCard,
  ChevronRight,
  Ticket,
  AlertTriangle,
  Contact,
  Mail,
  Palette,
  Crown,
  Send,
  Sparkles,
  Shield,
  Bot,
  TrendingUp,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";

interface SettingsSectionProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

function SettingsSection({ href, icon, title, description, badge, badgeColor = "bg-amber-500/20 text-amber-400" }: SettingsSectionProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 hover:bg-slate-700/50 transition group"
    >
      <div className="p-3 bg-slate-700 rounded-lg group-hover:bg-slate-600 transition">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium">{title}</h3>
          {badge && (
            <span className={`px-2 py-0.5 text-xs rounded-full ${badgeColor} flex items-center gap-1`}>
              <Crown className="h-3 w-3" />
              {badge}
            </span>
          )}
        </div>
        <p className="text-slate-400 text-sm">{description}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition" />
    </Link>
  );
}

export default function SettingsPage() {
  const { currentWorkspaceId, currentWorkspace } = useWorkspace();
  const { isEnterprise } = useSubscription(currentWorkspaceId);

  // Check if current user is workspace admin
  const developerId = typeof window !== "undefined" ? localStorage.getItem("developer_id") : null;
  const member = currentWorkspace?.members?.find((m) => m.developer_id === developerId);
  const isWorkspaceAdmin = member?.role === "owner" || member?.role === "admin";

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700 rounded-lg">
                <Settings className="h-5 w-5 text-slate-300" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Settings</h1>
                <p className="text-slate-400 text-sm">
                  Manage your workspace configuration
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="space-y-4">
          <SettingsSection
            href="/settings/appearance"
            icon={<Palette className="h-5 w-5 text-indigo-400" />}
            title="Appearance"
            description="Customize sidebar layout and visual preferences"
          />

          <SettingsSection
            href="/settings/repositories"
            icon={<FolderGit2 className="h-5 w-5 text-blue-400" />}
            title="Repositories"
            description="Manage GitHub repositories for analysis and sync"
          />

          <SettingsSection
            href="/settings/organization"
            icon={<Building2 className="h-5 w-5 text-purple-400" />}
            title="Organization"
            description="Manage your organization settings and preferences"
          />

          {isWorkspaceAdmin && (
            <SettingsSection
              href="/settings/access"
              icon={<Shield className="h-5 w-5 text-violet-400" />}
              title="Access Control"
              description="Manage which apps and modules each member can access"
            />
          )}

          <SettingsSection
            href="/crm/settings"
            icon={<Contact className="h-5 w-5 text-cyan-400" />}
            title="CRM Settings"
            description="Configure CRM objects, integrations, and deal automation"
          />

          <SettingsSection
            href="/email-marketing/settings"
            icon={<Mail className="h-5 w-5 text-sky-400" />}
            title="Email Marketing"
            description="Configure sending domains, providers, and email infrastructure"
          />

          {isWorkspaceAdmin && (
            <SettingsSection
              href="/settings/email-delivery"
              icon={<Send className="h-5 w-5 text-teal-400" />}
              title="Email Delivery"
              description="Monitor email delivery status and logs"
              badge={!isEnterprise ? "Enterprise" : undefined}
            />
          )}

          <SettingsSection
            href="/settings/agents"
            icon={<Bot className="h-5 w-5 text-purple-400" />}
            title="AI Agents"
            description="Create and manage custom AI agents for automation"
          />

          <SettingsSection
            href="/settings/projects"
            icon={<FolderKanban className="h-5 w-5 text-green-400" />}
            title="Projects"
            description="Manage projects, members, and permissions"
          />

          <SettingsSection
            href="/settings/task-config"
            icon={<ListChecks className="h-5 w-5 text-yellow-400" />}
            title="Task Configuration"
            description="Configure custom statuses and fields for sprint tasks"
          />

          <SettingsSection
            href="/settings/ticket-forms"
            icon={<Ticket className="h-5 w-5 text-pink-400" />}
            title="Ticket Forms"
            description="Create and manage public forms for collecting tickets"
          />

          {isWorkspaceAdmin && (
            <SettingsSection
              href="/settings/insights"
              icon={<TrendingUp className="h-5 w-5 text-indigo-400" />}
              title="Insights"
              description="Configure developer insights, team metrics, and working hours"
            />
          )}

          <SettingsSection
            href="/settings/escalation"
            icon={<AlertTriangle className="h-5 w-5 text-orange-400" />}
            title="Escalation Matrix"
            description="Configure automatic escalation rules based on ticket severity"
          />

          <SettingsSection
            href="/settings/integrations"
            icon={<Link2 className="h-5 w-5 text-orange-400" />}
            title="Integrations"
            description="Connect Jira, Linear, and other external tools"
          />

          <SettingsSection
            href="/settings/plans"
            icon={<Sparkles className="h-5 w-5 text-amber-400" />}
            title="Subscription Plans"
            description="Compare plans and upgrade or downgrade your subscription"
          />

          <SettingsSection
            href="/settings/billing"
            icon={<CreditCard className="h-5 w-5 text-emerald-400" />}
            title="Billing & Subscription"
            description="Manage your subscription, billing, and payment methods"
          />
        </div>
      </main>
    </div>
  );
}
