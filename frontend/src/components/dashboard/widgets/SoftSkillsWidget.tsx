"use client";

import Link from "next/link";
import {
  Target,
  ChevronRight,
  ClipboardCheck,
} from "lucide-react";

interface SoftSkillsWidgetProps {
  showGoals: boolean;
  showReviews: boolean;
}

export function SoftSkillsWidget({ showGoals, showReviews }: SoftSkillsWidgetProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-lg">
          <ClipboardCheck className="h-5 w-5 text-cyan-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Reviews & Goals</h2>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {showGoals && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Target className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">My Goals</h3>
              </div>
              <Link href="/reviews/goals" className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6">
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground text-sm mb-4">
                  Set SMART goals to track your progress and contributions.
                </p>
                <Link
                  href="/reviews/goals/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg text-sm font-medium transition"
                >
                  Create Your First Goal
                </Link>
              </div>
            </div>
          </div>
        )}

        {showReviews && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-500/10 rounded-lg">
                  <ClipboardCheck className="h-5 w-5 text-teal-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Performance Reviews</h3>
              </div>
              <Link href="/reviews" className="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 transition">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-muted rounded-lg border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span className="text-foreground font-medium text-sm">360° Feedback</span>
                </div>
                <p className="text-muted-foreground text-sm">
                  Request anonymous feedback from peers and managers with the COIN framework.
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-foreground font-medium text-sm">Auto-Contributions</span>
                </div>
                <p className="text-muted-foreground text-sm">
                  GitHub activity automatically linked to your review summaries.
                </p>
              </div>
              <Link
                href="/reviews"
                className="block w-full text-center px-4 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-600/30 rounded-lg text-sm font-medium transition"
              >
                Go to Reviews
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
