"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Mail,
  Send,
  Plus,
  BarChart3,
  Users,
  TrendingUp,
  Eye,
  MousePointer,
  Settings,
  Palette,
  Globe,
  Zap,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useEmailCampaigns,
  useEmailTemplates,
  useEmailAnalyticsOverview,
  useSendingDomains,
  useEmailProviders,
  useBestSendTimes,
  useTopCampaigns,
} from "@/hooks/useEmailMarketing";

export default function EmailMarketingPage() {
  const [activeTab, setActiveTab] = useState<"campaigns" | "templates" | "analytics" | "infrastructure">("campaigns");
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  // Fetch data from API
  const { campaigns, isLoading: campaignsLoading, error: campaignsError, refetch: refetchCampaigns } = useEmailCampaigns(workspaceId, { limit: 10 });
  const { templates, isLoading: templatesLoading, error: templatesError, refetch: refetchTemplates } = useEmailTemplates(workspaceId);
  const { data: analyticsOverview, isLoading: analyticsLoading, error: analyticsError } = useEmailAnalyticsOverview(workspaceId, 30);
  const { domains, isLoading: domainsLoading, error: domainsError, refetch: refetchDomains } = useSendingDomains(workspaceId);
  const { providers, isLoading: providersLoading, error: providersError } = useEmailProviders(workspaceId);
  const { data: bestSendTimes } = useBestSendTimes(workspaceId);
  const { data: topCampaigns } = useTopCampaigns(workspaceId, "clicks", 5);

  // Calculate stats from real data
  const stats = {
    totalSent: analyticsOverview?.total_sent || 0,
    avgOpenRate: analyticsOverview?.avg_open_rate || 0,
    avgClickRate: analyticsOverview?.avg_click_rate || 0,
    activeCampaigns: campaigns.filter(c => c.status === "sending" || c.status === "scheduled").length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent":
      case "completed":
        return "bg-emerald-500/20 text-emerald-400";
      case "sending":
      case "scheduled":
        return "bg-sky-500/20 text-sky-400";
      case "paused":
        return "bg-amber-500/20 text-amber-400";
      case "cancelled":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getDomainStatusColor = (domain: { is_active: boolean; warming_status: string; health_score: number }) => {
    if (!domain.is_active) return "bg-muted-foreground";
    if (domain.warming_status === "in_progress") return "bg-amber-400";
    if (domain.health_score >= 90) return "bg-emerald-400";
    if (domain.health_score >= 70) return "bg-amber-400";
    return "bg-red-400";
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">No Workspace Selected</h2>
          <p className="text-muted-foreground">Please select a workspace to view email marketing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl">
                <Mail className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Email Marketing</h1>
                <p className="text-muted-foreground text-sm">Campaigns, templates, and analytics</p>
              </div>
            </div>
            <Link
              href="/email-marketing/campaigns/new"
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition font-medium"
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background/50 border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-sky-500/20 rounded-lg">
                <Send className="h-5 w-5 text-sky-400" />
              </div>
              <span className="text-muted-foreground text-sm">Total Sent</span>
            </div>
            {analyticsLoading ? (
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{stats.totalSent.toLocaleString()}</p>
            )}
          </div>
          <div className="bg-background/50 border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Eye className="h-5 w-5 text-emerald-400" />
              </div>
              <span className="text-muted-foreground text-sm">Avg Open Rate</span>
            </div>
            {analyticsLoading ? (
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{stats.avgOpenRate.toFixed(1)}%</p>
            )}
          </div>
          <div className="bg-background/50 border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <MousePointer className="h-5 w-5 text-purple-400" />
              </div>
              <span className="text-muted-foreground text-sm">Avg Click Rate</span>
            </div>
            {analyticsLoading ? (
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{stats.avgClickRate.toFixed(1)}%</p>
            )}
          </div>
          <div className="bg-background/50 border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-amber-400" />
              </div>
              <span className="text-muted-foreground text-sm">Active Campaigns</span>
            </div>
            {campaignsLoading ? (
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{stats.activeCampaigns}</p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-background/50 border border-border rounded-lg p-1 w-fit">
          {[
            { id: "campaigns", label: "Campaigns", icon: Mail },
            { id: "templates", label: "Templates", icon: Palette },
            { id: "analytics", label: "Analytics", icon: BarChart3 },
            { id: "infrastructure", label: "Infrastructure", icon: Globe },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Recent Campaigns</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetchCampaigns()}
                  className="p-2 text-muted-foreground hover:text-foreground transition"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <Link href="/email-marketing/campaigns" className="text-sm text-sky-400 hover:text-sky-300">
                  View all
                </Link>
              </div>
            </div>

            {campaignsError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-400">Failed to load campaigns</p>
              </div>
            ) : campaignsLoading ? (
              <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mx-auto" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No campaigns yet</h3>
                <p className="text-muted-foreground mb-4">Create your first email campaign to get started.</p>
                <Link
                  href="/email-marketing/campaigns/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                >
                  <Plus className="h-4 w-4" />
                  Create Campaign
                </Link>
              </div>
            ) : (
              <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr className="text-left text-sm text-muted-foreground">
                      <th className="px-6 py-4 font-medium">Campaign</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Sent</th>
                      <th className="px-6 py-4 font-medium">Open Rate</th>
                      <th className="px-6 py-4 font-medium">Click Rate</th>
                      <th className="px-6 py-4 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaigns.map((campaign) => {
                      const openRate = campaign.sent_count > 0 ? (campaign.open_count / campaign.sent_count) * 100 : 0;
                      const clickRate = campaign.sent_count > 0 ? (campaign.click_count / campaign.sent_count) * 100 : 0;
                      return (
                        <tr key={campaign.id} className="hover:bg-muted/50 transition">
                          <td className="px-6 py-4">
                            <Link href={`/email-marketing/campaigns/${campaign.id}`} className="flex items-center gap-3 group">
                              <div className="w-10 h-10 bg-gradient-to-br from-sky-500/30 to-blue-500/30 rounded-lg flex items-center justify-center">
                                <Mail className="h-5 w-5 text-sky-400" />
                              </div>
                              <span className="text-foreground font-medium group-hover:text-sky-400 transition">{campaign.name}</span>
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                              {campaign.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-foreground">{campaign.sent_count.toLocaleString()}</td>
                          <td className="px-6 py-4 text-emerald-400">{openRate.toFixed(1)}%</td>
                          <td className="px-6 py-4 text-purple-400">{clickRate.toFixed(1)}%</td>
                          <td className="px-6 py-4">
                            <Link href={`/email-marketing/campaigns/${campaign.id}`} className="text-muted-foreground hover:text-foreground transition">
                              <Settings className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "templates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Email Templates</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetchTemplates()}
                  className="p-2 text-muted-foreground hover:text-foreground transition"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <Link
                  href="/email-marketing/templates/new"
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-foreground rounded-lg transition text-sm"
                >
                  <Plus className="h-4 w-4" />
                  New Template
                </Link>
              </div>
            </div>

            {templatesError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-400">Failed to load templates</p>
              </div>
            ) : templatesLoading ? (
              <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mx-auto" />
              </div>
            ) : templates.length === 0 ? (
              <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No templates yet</h3>
                <p className="text-muted-foreground mb-4">Create reusable email templates for your campaigns.</p>
                <Link
                  href="/email-marketing/templates/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                >
                  <Plus className="h-4 w-4" />
                  Create Template
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Link
                    key={template.id}
                    href={`/email-marketing/templates/${template.id}`}
                    className="bg-background/50 border border-border rounded-xl p-5 hover:border-border transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-sky-500/20 rounded-lg">
                        <Palette className="h-5 w-5 text-sky-400" />
                      </div>
                      <span className="text-foreground font-medium group-hover:text-sky-400 transition">{template.name}</span>
                    </div>
                    <p className="text-muted-foreground text-sm mb-2">{template.template_type}</p>
                    <p className="text-muted-foreground text-sm">
                      Last edited {new Date(template.updated_at).toLocaleDateString()}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            {analyticsError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-400">Failed to load analytics</p>
              </div>
            ) : (
              <>
                <div className="bg-background/50 border border-border rounded-xl p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Performance Overview (Last 30 Days)</h2>
                  {analyticsLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                    </div>
                  ) : analyticsOverview ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-foreground">{analyticsOverview.total_sent.toLocaleString()}</p>
                        <p className="text-muted-foreground text-sm">Emails Sent</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-emerald-400">{analyticsOverview.total_opens.toLocaleString()}</p>
                        <p className="text-muted-foreground text-sm">Opens</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-400">{analyticsOverview.total_clicks.toLocaleString()}</p>
                        <p className="text-muted-foreground text-sm">Clicks</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-amber-400">{analyticsOverview.total_bounces.toLocaleString()}</p>
                        <p className="text-muted-foreground text-sm">Bounces</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-sky-400">{analyticsOverview.campaigns_sent}</p>
                        <p className="text-muted-foreground text-sm">Campaigns</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">
                      <BarChart3 className="h-12 w-12" />
                      <span className="ml-4">No analytics data available</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-background/50 border border-border rounded-xl p-6">
                    <h3 className="text-foreground font-medium mb-4">Best Send Times</h3>
                    {bestSendTimes?.send_times && bestSendTimes.send_times.length > 0 ? (
                      <div className="space-y-3">
                        {bestSendTimes.send_times.slice(0, 3).map((time, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-muted-foreground">{time.day} {time.hour}:00</span>
                            <span className="text-emerald-400">{time.open_rate.toFixed(1)}% open rate</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">Not enough data yet</p>
                    )}
                  </div>
                  <div className="bg-background/50 border border-border rounded-xl p-6">
                    <h3 className="text-foreground font-medium mb-4">Top Performing Campaigns</h3>
                    {topCampaigns?.campaigns && topCampaigns.campaigns.length > 0 ? (
                      <div className="space-y-3">
                        {topCampaigns.campaigns.map((campaign) => (
                          <div key={campaign.id} className="flex items-center justify-between">
                            <span className="text-muted-foreground truncate">{campaign.name}</span>
                            <span className="text-purple-400">{campaign.value} clicks</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No campaign data yet</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "infrastructure" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-background/50 border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-purple-400" />
                    <h3 className="text-foreground font-medium">Sending Domains</h3>
                  </div>
                  <button
                    onClick={() => refetchDomains()}
                    className="p-1 text-muted-foreground hover:text-foreground transition"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
                {domainsError ? (
                  <p className="text-red-400 text-sm">Failed to load domains</p>
                ) : domainsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  </div>
                ) : domains.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No sending domains configured</p>
                ) : (
                  <div className="space-y-3">
                    {domains.map((domain) => (
                      <div key={domain.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${getDomainStatusColor(domain)}`} />
                          <span className="text-foreground">{domain.domain}</span>
                        </div>
                        {domain.warming_status === "in_progress" ? (
                          <span className="text-amber-400 text-sm">Day {domain.warming_day}/14</span>
                        ) : (
                          <span className="text-emerald-400 text-sm">{domain.health_score}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-background/50 border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Zap className="h-5 w-5 text-amber-400" />
                  <h3 className="text-foreground font-medium">Email Providers</h3>
                </div>
                {providersError ? (
                  <p className="text-red-400 text-sm">Failed to load providers</p>
                ) : providersLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  </div>
                ) : providers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No email providers configured</p>
                ) : (
                  <div className="space-y-3">
                    {providers.map((provider) => (
                      <div key={provider.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <span className="text-foreground">{provider.name}</span>
                        <span className={`text-sm ${provider.is_active ? "text-emerald-400" : "text-muted-foreground"}`}>
                          {provider.is_active ? "Connected" : "Inactive"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-background/50 border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="h-5 w-5 text-sky-400" />
                <h3 className="text-foreground font-medium">Subscriber Overview</h3>
              </div>
              {analyticsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{analyticsOverview?.active_subscribers?.toLocaleString() || 0}</p>
                    <p className="text-muted-foreground text-sm">Active subscribers</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{analyticsOverview?.total_unsubscribes || 0}</p>
                    <p className="text-muted-foreground text-sm">Unsubscribed (30d)</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-foreground">
                      {analyticsOverview?.avg_bounce_rate ? `${analyticsOverview.avg_bounce_rate.toFixed(2)}%` : "0%"}
                    </p>
                    <p className="text-muted-foreground text-sm">Bounce rate</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
