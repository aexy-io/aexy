"use client";

import { useState, useEffect } from "react";
import {
  CalendarDays,
  Plus,
  Briefcase,
  Users,
  CheckSquare,
  Settings,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  useLeaveBalances,
  useMyLeaveRequests,
  usePendingApprovals,
  useLeaveRequestMutations,
} from "@/hooks/useLeave";
import { LeaveBalanceCard } from "@/components/leave/LeaveBalanceCard";
import { LeaveRequestCard } from "@/components/leave/LeaveRequestCard";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { LeaveApprovalCard } from "@/components/leave/LeaveApprovalCard";
import { TeamLeaveTable } from "@/components/leave/TeamLeaveTable";
import { LeaveTypeSettings } from "@/components/leave/LeaveTypeSettings";
import { LeavePolicySettings } from "@/components/leave/LeavePolicySettings";
import { HolidaySettings } from "@/components/leave/HolidaySettings";
import { useSearchParams, useRouter } from "next/navigation";

type Tab = "my-leaves" | "team-leaves" | "approvals" | "settings";
const validTabs: Tab[] = ["my-leaves", "team-leaves", "approvals", "settings"];

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "my-leaves", label: "My Leaves", icon: Briefcase },
  { id: "team-leaves", label: "Team Leaves", icon: Users },
  { id: "approvals", label: "Approvals", icon: CheckSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function LeavePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const initialTab = validTabs.includes(tabParam as Tab) ? (tabParam as Tab) : "my-leaves";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && validTabs.includes(tab as Tab)) {
      setActiveTab(tab as Tab);
    } else {
      setActiveTab("my-leaves");
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <CalendarDays className="h-7 w-7 text-blue-400" />
              Leave Management
            </h1>
            <p className="text-slate-400 mt-1 ml-10">
              Track and manage your leaves, approvals, and team availability
            </p>
          </div>
          <button
            onClick={() => setShowRequestForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/20"
          >
            <Plus className="h-4 w-4" />
            Request Leave
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Leave management" className="flex items-center gap-1 border-b border-slate-800 mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  const params = new URLSearchParams(searchParams.toString());
                  if (tab.id === "my-leaves") {
                    params.delete("tab");
                  } else {
                    params.set("tab", tab.id);
                  }
                  router.replace(`/leave${params.toString() ? `?${params.toString()}` : ""}`);
                }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition relative ${
                  isActive
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div role="tabpanel" id={`tabpanel-${activeTab}`}>
          {activeTab === "my-leaves" && <MyLeavesTab />}
          {activeTab === "team-leaves" && <TeamLeavesTab />}
          {activeTab === "approvals" && <ApprovalsTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>

        {/* Request Leave Modal */}
        <LeaveRequestForm
          isOpen={showRequestForm}
          onClose={() => setShowRequestForm(false)}
        />
      </main>
    </div>
  );
}

// ─── My Leaves Tab ─────────────────────────────────────────────────────────────

function MyLeavesTab() {
  const { data: balances, isLoading: balancesLoading, isError: balancesError } = useLeaveBalances();
  const { data: requests, isLoading: requestsLoading, isError: requestsError } = useMyLeaveRequests();

  return (
    <div className="space-y-8">
      {/* Balances */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Leave Balances</h2>
        {balancesError ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-400">Failed to load leave balances. Please try again.</p>
          </div>
        ) : balancesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse"
              >
                <div className="h-4 bg-slate-800 rounded w-1/2 mb-4" />
                <div className="h-2.5 bg-slate-800 rounded w-full mb-3" />
                <div className="h-3 bg-slate-800 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : balances && balances.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {balances.map((balance) => (
              <LeaveBalanceCard key={balance.id} balance={balance} />
            ))}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500">
              No leave balances found. Contact your admin to set up leave policies.
            </p>
          </div>
        )}
      </section>

      {/* My Requests */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">My Requests</h2>
        {requestsError ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-400">Failed to load leave requests. Please try again.</p>
          </div>
        ) : requestsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse"
              >
                <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
                <div className="h-3 bg-slate-800 rounded w-1/2 mb-2" />
                <div className="h-3 bg-slate-800 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : requests && requests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map((request) => (
              <LeaveRequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <CalendarDays className="h-8 w-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              No leave requests yet. Click &quot;Request Leave&quot; to get started.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Team Leaves Tab ───────────────────────────────────────────────────────────

function TeamLeavesTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">Team Leave Requests</h2>
      <TeamLeaveTable />
    </div>
  );
}

// ─── Approvals Tab ─────────────────────────────────────────────────────────────

function ApprovalsTab() {
  const { data: pendingRequests, isLoading, isError } = usePendingApprovals();
  const { approve, reject } = useLeaveRequestMutations();

  const handleApprove = (id: string) => {
    approve.mutate(id);
  };

  const handleReject = (id: string, reason?: string) => {
    reject.mutate({ requestId: id, reason });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">
        Pending Approvals
        {pendingRequests && pendingRequests.length > 0 && (
          <span className="ml-2 text-sm font-normal text-slate-400">
            ({pendingRequests.length} pending)
          </span>
        )}
      </h2>

      {isError ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">Failed to load pending approvals. Please try again.</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
        </div>
      ) : pendingRequests && pendingRequests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingRequests.map((request) => (
            <LeaveApprovalCard
              key={request.id}
              request={request}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <CheckSquare className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            No pending approvals. All caught up!
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab() {
  const [settingsSection, setSettingsSection] = useState<
    "types" | "policies" | "holidays"
  >("types");

  const sections: { id: typeof settingsSection; label: string }[] = [
    { id: "types", label: "Leave Types" },
    { id: "policies", label: "Policies" },
    { id: "holidays", label: "Holidays" },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex items-center gap-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setSettingsSection(section.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              settingsSection === section.id
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Settings Content */}
      {settingsSection === "types" && <LeaveTypeSettings />}
      {settingsSection === "policies" && <LeavePolicySettings />}
      {settingsSection === "holidays" && <HolidaySettings />}
    </div>
  );
}
