"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Plus,
  Zap,
  Play,
  Pause,
  Trash2,
  Clock,
  Search,
  Edit2,
  Building2,
  Ticket,
  Users,
  Mail,
  MonitorCheck,
  Calendar,
  FileText,
  CalendarCheck,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAutomations } from "@/hooks/useAutomations";
import { AutomationModule, Automation } from "@/lib/api";

const moduleLabels: Record<AutomationModule, string> = {
  crm: "CRM",
  tickets: "Tickets",
  hiring: "Hiring",
  email_marketing: "Email",
  uptime: "Uptime",
  sprints: "Sprints",
  forms: "Forms",
  booking: "Booking",
};

const moduleIcons: Record<AutomationModule, React.ElementType> = {
  crm: Building2,
  tickets: Ticket,
  hiring: Users,
  email_marketing: Mail,
  uptime: MonitorCheck,
  sprints: Calendar,
  forms: FileText,
  booking: CalendarCheck,
};

const moduleColors: Record<AutomationModule, string> = {
  crm: "bg-blue-500/20 text-blue-400",
  tickets: "bg-orange-500/20 text-orange-400",
  hiring: "bg-purple-500/20 text-purple-400",
  email_marketing: "bg-pink-500/20 text-pink-400",
  uptime: "bg-green-500/20 text-green-400",
  sprints: "bg-yellow-500/20 text-yellow-400",
  forms: "bg-cyan-500/20 text-cyan-400",
  booking: "bg-indigo-500/20 text-indigo-400",
};

function ModuleBadge({ module }: { module: AutomationModule }) {
  const Icon = moduleIcons[module] || Zap;
  const color = moduleColors[module] || "bg-slate-500/20 text-slate-400";
  const label = moduleLabels[module] || module;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function AutomationCard({
  automation,
  onToggle,
  onDelete,
  onEdit,
}: {
  automation: Automation;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${automation.is_active ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"}`}>
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">{automation.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <ModuleBadge module={automation.module as AutomationModule} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
            title="Edit automation"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              automation.is_active
                ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
            title={automation.is_active ? "Pause automation" : "Activate automation"}
          >
            {automation.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {automation.description && (
        <p className="text-sm text-slate-400 mb-3 line-clamp-2">{automation.description}</p>
      )}

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Trigger:</span>
          <span className="text-slate-300">{automation.trigger_type.replace(/[._]/g, " ")}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Actions:</span>
          <span className="text-slate-300">
            {automation.actions.length} action{automation.actions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Play className="h-3 w-3" />
          {automation.total_runs} runs
        </span>
        {automation.last_run_at && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last run: {new Date(automation.last_run_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

const ALL_MODULES: AutomationModule[] = ["crm", "tickets", "hiring", "email_marketing", "uptime", "sprints", "forms", "booking"];

export default function AutomationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  // Get initial module filter from URL
  const initialModule = searchParams.get("module") as AutomationModule | null;
  const [selectedModule, setSelectedModule] = useState<AutomationModule | null>(initialModule);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    automations,
    isLoading,
    toggleAutomation,
    deleteAutomation,
  } = useAutomations(workspaceId, { module: selectedModule || undefined });

  const filteredAutomations = automations.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleModuleChange = (module: AutomationModule | null) => {
    setSelectedModule(module);
    // Update URL without navigation
    const url = new URL(window.location.href);
    if (module) {
      url.searchParams.set("module", module);
    } else {
      url.searchParams.delete("module");
    }
    window.history.replaceState({}, "", url.toString());
  };

  const handleDeleteAutomation = async (id: string) => {
    if (confirm("Delete this automation?")) {
      await deleteAutomation(id);
    }
  };

  const handleCreateNew = () => {
    const url = selectedModule
      ? `/automations/new?module=${selectedModule}`
      : "/automations/new";
    router.push(url);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex sm:flex-row flex-col sm:items-center sm:justify-between items-start">
              <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Automations</h1>
              <p className="text-sm text-slate-400">Automate workflows across all Aexy modules</p>
            </div>
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Automation
            </button>
            </div>
          </div>

          {/* Module Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-800/50 border border-slate-700 rounded-xl mb-6 overflow-x-auto">
            <button
              onClick={() => handleModuleChange(null)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                selectedModule === null ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All Modules
            </button>
            {ALL_MODULES.map((module) => {
              const Icon = moduleIcons[module];
              return (
                <button
                  key={module}
                  onClick={() => handleModuleChange(module)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    selectedModule === module ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {moduleLabels[module]}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search automations..."
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-slate-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredAutomations.length === 0 ? (
            <div className="text-center py-16">
              <Zap className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                {selectedModule ? `No ${moduleLabels[selectedModule]} automations yet` : "No automations yet"}
              </h3>
              <p className="text-slate-400 mb-4">
                {selectedModule
                  ? `Create your first ${moduleLabels[selectedModule]} automation to streamline your workflows`
                  : "Create your first automation to streamline your workflows"}
              </p>
              <button
                onClick={handleCreateNew}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                <Plus className="h-4 w-4" />
                Create Automation
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAutomations.map((automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  onToggle={() => toggleAutomation(automation.id)}
                  onDelete={() => handleDeleteAutomation(automation.id)}
                  onEdit={() => router.push(`/automations/${automation.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
