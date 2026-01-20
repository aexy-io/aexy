"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Mail,
  Play,
  Pause,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
  Eye,
  MousePointer,
  Users,
  TrendingUp,
  ArrowUpRight,
  BarChart3,
  XCircle,
  CheckCircle,
  RefreshCw,
  Copy,
  Trash2,
  Edit2,
  TestTube,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import {
  useEmailCampaign,
  useCampaignRecipients,
  useCampaignAnalytics,
  usePauseCampaign,
  useResumeCampaign,
  useCancelCampaign,
  useSendCampaign,
  useDuplicateCampaign,
  useDeleteCampaign,
} from "@/hooks/useEmailMarketing";

type TabType = "overview" | "recipients" | "analytics";

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const campaignId = params.campaignId as string;
  const workspaceId = currentWorkspace?.id || null;

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmails, setTestEmails] = useState("");

  const { data: campaign, isLoading, error, refetch } = useEmailCampaign(workspaceId, campaignId);
  const { data: recipientsData, isLoading: recipientsLoading } = useCampaignRecipients(
    workspaceId,
    campaignId,
    { limit: 50 }
  );
  const { data: analytics, isLoading: analyticsLoading } = useCampaignAnalytics(workspaceId, campaignId);

  const pauseCampaign = usePauseCampaign(workspaceId);
  const resumeCampaign = useResumeCampaign(workspaceId);
  const cancelCampaign = useCancelCampaign(workspaceId);
  const sendCampaign = useSendCampaign(workspaceId);
  const duplicateCampaign = useDuplicateCampaign(workspaceId);
  const deleteCampaign = useDeleteCampaign(workspaceId);

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
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  const getRecipientStatusColor = (status: string) => {
    switch (status) {
      case "delivered":
        return "text-emerald-400";
      case "opened":
        return "text-sky-400";
      case "clicked":
        return "text-purple-400";
      case "bounced":
        return "text-red-400";
      case "failed":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  const handleSend = async () => {
    if (confirm("Are you sure you want to send this campaign now?")) {
      await sendCampaign.mutateAsync(campaignId);
      refetch();
    }
  };

  const handlePause = async () => {
    await pauseCampaign.mutateAsync(campaignId);
    refetch();
  };

  const handleResume = async () => {
    await resumeCampaign.mutateAsync(campaignId);
    refetch();
  };

  const handleCancel = async () => {
    if (confirm("Are you sure you want to cancel this campaign?")) {
      await cancelCampaign.mutateAsync(campaignId);
      refetch();
    }
  };

  const handleDuplicate = async () => {
    const newCampaign = await duplicateCampaign.mutateAsync(campaignId);
    router.push(`/email-marketing/campaigns/${newCampaign.id}`);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this campaign? This cannot be undone.")) {
      await deleteCampaign.mutateAsync(campaignId);
      router.push("/email-marketing/campaigns");
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Workspace Selected</h2>
            <p className="text-slate-400">Please select a workspace to view this campaign.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Campaign Not Found</h2>
            <p className="text-slate-400 mb-4">The campaign you're looking for doesn't exist.</p>
            <Link
              href="/email-marketing/campaigns"
              className="text-sky-400 hover:text-sky-300"
            >
              Back to Campaigns
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const openRate = campaign.sent_count > 0 ? (campaign.open_count / campaign.sent_count) * 100 : 0;
  const clickRate = campaign.sent_count > 0 ? (campaign.click_count / campaign.sent_count) * 100 : 0;
  const bounceRate = campaign.sent_count > 0 ? (campaign.bounce_count / campaign.sent_count) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-950">
<div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <button
              onClick={() => router.push("/email-marketing/campaigns")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition mt-1"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(campaign.status)}`}>
                  {campaign.status}
                </span>
              </div>
              <p className="text-slate-400">{campaign.subject}</p>
            </div>
            <div className="flex items-center gap-2">
              {campaign.status === "draft" && (
                <>
                  <button
                    onClick={() => setShowTestModal(true)}
                    className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  >
                    <TestTube className="h-4 w-4" />
                    Test
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sendCampaign.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
                  >
                    {sendCampaign.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send Now
                  </button>
                </>
              )}
              {(campaign.status === "sending" || campaign.status === "scheduled") && (
                <button
                  onClick={handlePause}
                  disabled={pauseCampaign.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
                >
                  {pauseCampaign.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                  Pause
                </button>
              )}
              {campaign.status === "paused" && (
                <button
                  onClick={handleResume}
                  disabled={resumeCampaign.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50"
                >
                  {resumeCampaign.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Resume
                </button>
              )}
              <button
                onClick={handleDuplicate}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                title="Duplicate"
              >
                <Copy className="h-4 w-4" />
              </button>
              {(campaign.status === "draft" || campaign.status === "cancelled") && (
                <button
                  onClick={handleDelete}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <Send className="h-4 w-4" />
                Sent
              </div>
              <p className="text-2xl font-bold text-white">{campaign.sent_count.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <Eye className="h-4 w-4" />
                Opens
              </div>
              <p className="text-2xl font-bold text-emerald-400">{campaign.open_count.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{openRate.toFixed(1)}% rate</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <MousePointer className="h-4 w-4" />
                Clicks
              </div>
              <p className="text-2xl font-bold text-purple-400">{campaign.click_count.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{clickRate.toFixed(1)}% rate</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <XCircle className="h-4 w-4" />
                Bounces
              </div>
              <p className="text-2xl font-bold text-red-400">{campaign.bounce_count}</p>
              <p className="text-xs text-slate-500">{bounceRate.toFixed(1)}% rate</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <Users className="h-4 w-4" />
                Unsubscribes
              </div>
              <p className="text-2xl font-bold text-amber-400">{campaign.unsubscribe_count || 0}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/50 border border-slate-800 rounded-xl mb-6 w-fit">
            {[
              { id: "overview", label: "Overview", icon: Mail },
              { id: "recipients", label: "Recipients", icon: Users },
              { id: "analytics", label: "Analytics", icon: BarChart3 },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as TabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === id
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-medium text-white mb-4">Campaign Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide">From</label>
                    <p className="text-white">{campaign.from_name} &lt;{campaign.from_email}&gt;</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide">Subject</label>
                    <p className="text-white">{campaign.subject}</p>
                  </div>
                  {campaign.preview_text && (
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wide">Preview Text</label>
                      <p className="text-slate-300">{campaign.preview_text}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide">Type</label>
                    <p className="text-white capitalize">{campaign.campaign_type}</p>
                  </div>
                  {campaign.template_id && (
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-wide">Template</label>
                      <Link
                        href={`/email-marketing/templates/${campaign.template_id}`}
                        className="text-sky-400 hover:text-sky-300 flex items-center gap-1"
                      >
                        View Template
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-medium text-white mb-4">Timeline</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800 rounded-lg">
                      <Clock className="h-4 w-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Created</p>
                      <p className="text-white">{new Date(campaign.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  {campaign.scheduled_at && (
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Calendar className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Scheduled</p>
                        <p className="text-white">{new Date(campaign.scheduled_at).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {campaign.sent_at && (
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <Send className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Sent</p>
                        <p className="text-white">{new Date(campaign.sent_at).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {campaign.completed_at && (
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Completed</p>
                        <p className="text-white">{new Date(campaign.completed_at).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "recipients" && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Recipients</h3>
                <span className="text-sm text-slate-400">
                  {recipientsData?.total || 0} total
                </span>
              </div>
              {recipientsLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-6 w-6 text-slate-500 animate-spin mx-auto" />
                </div>
              ) : !recipientsData?.items?.length ? (
                <div className="p-8 text-center">
                  <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No recipients yet</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-slate-800">
                    <tr className="text-left text-sm text-slate-400">
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Sent At</th>
                      <th className="px-4 py-3 font-medium">Opened</th>
                      <th className="px-4 py-3 font-medium">Clicked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recipientsData.items.map((recipient: {
                      id: string;
                      email: string;
                      status: string;
                      sent_at?: string;
                      opened_at?: string;
                      clicked_at?: string;
                    }) => (
                      <tr key={recipient.id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-white">{recipient.email}</td>
                        <td className="px-4 py-3">
                          <span className={`capitalize ${getRecipientStatusColor(recipient.status)}`}>
                            {recipient.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {recipient.sent_at ? new Date(recipient.sent_at).toLocaleString() : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {recipient.opened_at ? new Date(recipient.opened_at).toLocaleString() : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {recipient.clicked_at ? new Date(recipient.clicked_at).toLocaleString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="space-y-6">
              {analyticsLoading ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                  <Loader2 className="h-8 w-8 text-slate-500 animate-spin mx-auto" />
                </div>
              ) : !analytics ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                  <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No analytics yet</h3>
                  <p className="text-slate-400">Analytics will appear once the campaign has been sent.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-medium text-white mb-4">Engagement Over Time</h3>
                      <div className="h-48 flex items-center justify-center text-slate-500">
                        <p className="text-sm">Chart visualization would go here</p>
                      </div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-medium text-white mb-4">Device Breakdown</h3>
                      {analytics.device_stats ? (
                        <div className="space-y-3">
                          {Object.entries(analytics.device_stats).map(([device, count]) => (
                            <div key={device} className="flex items-center justify-between">
                              <span className="text-slate-400 capitalize">{device}</span>
                              <span className="text-white">{count as number}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 text-sm">No device data available</p>
                      )}
                    </div>
                  </div>
                  {analytics.link_stats && analytics.link_stats.length > 0 && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-medium text-white mb-4">Link Performance</h3>
                      <div className="space-y-3">
                        {analytics.link_stats.map((link: { url: string; clicks: number }, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <span className="text-slate-300 truncate max-w-md">{link.url}</span>
                            <span className="text-purple-400 font-medium">{link.clicks} clicks</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Test Email Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-medium text-white">Send Test Email</h3>
            </div>
            <div className="p-4">
              <label className="block text-sm text-slate-400 mb-2">
                Email addresses (comma-separated)
              </label>
              <input
                type="text"
                value={testEmails}
                onChange={(e) => setTestEmails(e.target.value)}
                placeholder="test@example.com, test2@example.com"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Test functionality would go here
                  setShowTestModal(false);
                  setTestEmails("");
                }}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
              >
                Send Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
