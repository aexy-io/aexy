"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Settings,
  FolderGit2,
  Building2,
  Users,
  ListChecks,
  Link2,
  CreditCard,
  ChevronRight,
  Ticket,
} from "lucide-react";

interface SettingsSectionProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function SettingsSection({ href, icon, title, description }: SettingsSectionProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 hover:bg-slate-700/50 transition group"
    >
      <div className="p-3 bg-slate-700 rounded-lg group-hover:bg-slate-600 transition">
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="text-white font-medium">{title}</h3>
        <p className="text-slate-400 text-sm">{description}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition" />
    </Link>
  );
}

export default function SettingsPage() {
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

          <SettingsSection
            href="/settings/projects"
            icon={<Users className="h-5 w-5 text-green-400" />}
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

          <SettingsSection
            href="/settings/integrations"
            icon={<Link2 className="h-5 w-5 text-orange-400" />}
            title="Integrations"
            description="Connect Jira, Linear, and other external tools"
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
