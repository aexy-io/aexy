"use client";

import { Activity } from "lucide-react";
import { UnifiedActivityFeed } from "@/components/activity/UnifiedActivityFeed";

export default function ActivityPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-muted/50">
        <div className=" mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Activity className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Activity Feed</h1>
              <p className="text-sm text-muted-foreground">
                All activity across your workspace in one place
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className=" mx-auto px-4 py-8">
        <UnifiedActivityFeed />
      </main>
    </div>
  );
}
