"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Plus,
  Mail,
  Play,
  Pause,
  Trash2,
  Search,
  Clock,
  Eye,
  MousePointer,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  Copy,
  MoreHorizontal,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import {
  useEmailCampaigns,
  usePauseCampaign,
  useResumeCampaign,
  useCancelCampaign,
  useDuplicateCampaign,
  useDeleteCampaign,
} from "@/hooks/useEmailMarketing";
import { EmailCampaign } from "@/lib/api";

type StatusFilter = "all" | "draft" | "scheduled" | "sending" | "sent" | "paused" | "cancelled";
type SortOption = "newest" | "oldest" | "name" | "sent_count";

function CampaignCard({
  campaign,
  onPause,
  onResume,
  onCancel,
  onDuplicate,
  onDelete,
}: {
  campaign: EmailCampaign;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();

  const openRate = campaign.sent_count > 0 ? (campaign.open_count / campaign.sent_count) * 100 : 0;
  const clickRate = campaign.sent_count > 0 ? (campaign.click_count / campaign.sent_count) * 100 : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent":
      case "completed":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "sending":
        return "bg-sky-500/20 text-sky-400 border-sky-500/30";
      case "scheduled":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "paused":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "cancelled":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="bg-background/50 border border-border rounded-xl p-5 hover:border-border transition group">
      <div className="flex items-start justify-between mb-4">
        <Link
          href={`/email-marketing/campaigns/${campaign.id}`}
          className="flex items-center gap-3 flex-1"
        >
          <div className="p-2 bg-gradient-to-br from-sky-500/20 to-blue-500/20 rounded-lg">
            <Mail className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-foreground font-medium group-hover:text-sky-400 transition">
              {campaign.name}
            </h3>
            {campaign.subject && <p className="text-sm text-muted-foreground">{campaign.subject}</p>}
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(campaign.status)}`}>
            {campaign.status}
          </span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-muted border border-border rounded-lg shadow-xl z-20 py-1">
                  <Link
                    href={`/email-marketing/campaigns/${campaign.id}`}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Eye className="h-4 w-4" />
                    View Details
                  </Link>
                  {(campaign.status === "sending" || campaign.status === "scheduled") && (
                    <button
                      onClick={() => { onPause(); setShowMenu(false); }}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-foreground w-full"
                    >
                      <Pause className="h-4 w-4" />
                      Pause Campaign
                    </button>
                  )}
                  {campaign.status === "paused" && (
                    <button
                      onClick={() => { onResume(); setShowMenu(false); }}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-foreground w-full"
                    >
                      <Play className="h-4 w-4" />
                      Resume Campaign
                    </button>
                  )}
                  <button
                    onClick={() => { onDuplicate(); setShowMenu(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-foreground w-full"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  {campaign.status !== "sent" && campaign.status !== "cancelled" && (
                    <button
                      onClick={() => { onCancel(); setShowMenu(false); }}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-amber-400 hover:bg-accent w-full"
                    >
                      <Pause className="h-4 w-4" />
                      Cancel Campaign
                    </button>
                  )}
                  {(campaign.status === "draft" || campaign.status === "cancelled") && (
                    <button
                      onClick={() => { onDelete(); setShowMenu(false); }}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-accent w-full"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <p className="text-lg font-semibold text-foreground">{campaign.sent_count.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Sent</p>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <p className="text-lg font-semibold text-emerald-400">{openRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">Open Rate</p>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <p className="text-lg font-semibold text-purple-400">{clickRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">Click Rate</p>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <p className="text-lg font-semibold text-amber-400">{campaign.bounce_count ?? 0}</p>
          <p className="text-xs text-muted-foreground">Bounces</p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {campaign.scheduled_at && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Scheduled: {new Date(campaign.scheduled_at).toLocaleString()}
          </span>
        )}
        {campaign.sent_at && (
          <span className="flex items-center gap-1">
            <Send className="h-3 w-3" />
            Sent: {new Date(campaign.sent_at).toLocaleString()}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Created: {new Date(campaign.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const workspaceId = currentWorkspace?.id || null;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);

  const { campaigns, isLoading, error, refetch } = useEmailCampaigns(workspaceId, {
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const pauseCampaign = usePauseCampaign(workspaceId);
  const resumeCampaign = useResumeCampaign(workspaceId);
  const cancelCampaign = useCancelCampaign(workspaceId);
  const duplicateCampaign = useDuplicateCampaign(workspaceId);
  const deleteCampaign = useDeleteCampaign(workspaceId);

  const filteredCampaigns = campaigns
    .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                   (c.subject?.toLowerCase() || "").includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        case "sent_count":
          return b.sent_count - a.sent_count;
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this campaign?")) {
      await deleteCampaign.mutateAsync(id);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-background">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Workspace Selected</h2>
            <p className="text-muted-foreground">Please select a workspace to view campaigns.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
<div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/email-marketing")}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Email Campaigns</h1>
              <p className="text-sm text-muted-foreground">Manage and monitor your email campaigns</p>
            </div>
            <Link
              href="/email-marketing/campaigns/new"
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition font-medium"
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </Link>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaigns..."
                className="w-full pl-10 pr-4 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition ${
                showFilters || statusFilter !== "all"
                  ? "bg-sky-500/20 border-sky-500/30 text-sky-400"
                  : "bg-background/50 border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-background/50 border border-border rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="sending">Sending</option>
                    <option value="sent">Sent</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="name">Name A-Z</option>
                    <option value="sent_count">Most Sent</option>
                  </select>
                </div>
                {(statusFilter !== "all") && (
                  <button
                    onClick={() => setStatusFilter("all")}
                    className="mt-5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Campaign List */}
          {error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 text-center">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-foreground mb-2">Failed to load campaigns</h3>
              <p className="text-red-400 mb-4">{error.message}</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
              >
                Try Again
              </button>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-background/50 border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="bg-background/50 border border-border rounded-xl p-16 text-center">
              <Mail className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium text-foreground mb-2">
                {searchQuery || statusFilter !== "all" ? "No campaigns found" : "No campaigns yet"}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Create your first email campaign to start engaging with your audience."}
              </p>
              {!searchQuery && statusFilter === "all" && (
                <Link
                  href="/email-marketing/campaigns/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                >
                  <Plus className="h-4 w-4" />
                  Create Campaign
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? "s" : ""}
              </p>
              {filteredCampaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onPause={() => pauseCampaign.mutate(campaign.id)}
                  onResume={() => resumeCampaign.mutate(campaign.id)}
                  onCancel={() => cancelCampaign.mutate(campaign.id)}
                  onDuplicate={() => duplicateCampaign.mutate(campaign.id)}
                  onDelete={() => handleDelete(campaign.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
