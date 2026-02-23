"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Swords,
  Loader2,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  Shield,
  TrendingUp,
  TrendingDown,
  MessageSquare,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMCompetitor, useGTMBattleCard } from "@/hooks/useGTM";

type Tab = "overview" | "changes" | "battlecard";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "changes", label: "Changes" },
  { id: "battlecard", label: "Battle Card" },
];

function ListSection({
  title,
  items,
  icon,
  color = "text-foreground",
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  color?: string;
}) {
  if (!items?.length) return null;
  return (
    <div className="bg-muted/50 border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className={`text-sm ${color} flex items-start gap-2`}>
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CompetitorDetailPage() {
  const { competitorId } = useParams<{ competitorId: string }>();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;

  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { competitor, isLoading: competitorLoading } = useGTMCompetitor(
    workspaceId,
    competitorId
  );
  const { battleCard, isLoading: battleCardLoading } = useGTMBattleCard(
    workspaceId,
    competitorId
  );

  const isLoading = competitorLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!competitor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Swords className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Competitor not found</p>
          <Link
            href="/gtm/competitors"
            className="text-indigo-400 text-sm mt-2 inline-block hover:underline"
          >
            Back to Competitors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Back + Header */}
        <Link
          href="/gtm/competitors"
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Competitors
        </Link>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Swords className="w-7 h-7 text-indigo-400" />
              {competitor.name}
            </h1>
            {competitor.domain && (
              <a
                href={`https://${competitor.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-indigo-400 text-sm mt-1 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {competitor.domain}
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${
                competitor.is_active
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
              }`}
            >
              {competitor.is_active ? "Active" : "Inactive"}
            </span>
            <button
              onClick={() => window.location.reload()}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-muted/50 border border-border rounded-xl p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Tracked Pages</p>
                <p className="text-2xl font-bold text-foreground">
                  {(competitor.tracked_pages ?? []).length}
                </p>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Added</p>
                <p className="text-lg font-semibold text-foreground">
                  {competitor.created_at
                    ? new Date(competitor.created_at).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            </div>

            {/* Tracked pages list */}
            {(competitor.tracked_pages ?? []).length > 0 && (
              <div className="bg-muted/50 border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Tracked Pages</h3>
                <ul className="space-y-2">
                  {competitor.tracked_pages.map((url: string, i: number) => (
                    <li key={i}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Latest snapshot */}
            {competitor.current_snapshot && (
              <div className="bg-muted/50 border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Latest Snapshot</h3>
                <pre className="text-xs text-muted-foreground overflow-auto max-h-64 bg-black/20 rounded-lg p-3">
                  {JSON.stringify(competitor.current_snapshot, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === "changes" && (
          <div className="bg-muted/50 border border-border rounded-xl p-8 text-center">
            <Swords className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Changes view</p>
            <p className="text-muted-foreground text-sm mt-1">
              Full change history for this competitor coming soon.
            </p>
          </div>
        )}

        {activeTab === "battlecard" && (
          <div className="space-y-4">
            {battleCardLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : !battleCard ? (
              <div className="bg-muted/50 border border-border rounded-xl p-12 text-center">
                <Shield className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No battle card yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Battle cards are generated automatically from competitor analysis.
                </p>
              </div>
            ) : (
              <>
                {battleCard.win_rate != null && (
                  <div className="bg-muted/50 border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Win Rate vs {competitor.name}</p>
                    <p className="text-3xl font-bold text-foreground">{(battleCard.win_rate * 100).toFixed(0)}%</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ListSection
                    title="Our Strengths"
                    items={battleCard.strengths ?? []}
                    icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                    color="text-emerald-300"
                  />
                  <ListSection
                    title="Their Advantages"
                    items={battleCard.advantages ?? []}
                    icon={<TrendingDown className="w-4 h-4 text-red-400" />}
                    color="text-red-300"
                  />
                  <ListSection
                    title="Weaknesses"
                    items={battleCard.weaknesses ?? []}
                    icon={<TrendingDown className="w-4 h-4 text-amber-400" />}
                    color="text-amber-300"
                  />
                  <ListSection
                    title="Objection Handling"
                    items={battleCard.objection_handling ?? []}
                    icon={<MessageSquare className="w-4 h-4 text-blue-400" />}
                    color="text-blue-300"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
