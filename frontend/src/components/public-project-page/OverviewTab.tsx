"use client";

import { Users, Layers, Calendar } from "lucide-react";
import { PublicProject } from "@/lib/api";

interface OverviewTabProps {
  project: PublicProject;
}

export function OverviewTab({ project }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {project.description && (
        <div className="bg-muted rounded-xl p-6">
          <h2 className="text-lg font-medium text-foreground mb-3">About</h2>
          <p className="text-foreground whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-muted rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-muted-foreground text-sm">Members</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{project.member_count}</p>
        </div>

        <div className="bg-muted rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Layers className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-muted-foreground text-sm">Teams</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{project.team_count}</p>
        </div>

        <div className="bg-muted rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Calendar className="h-5 w-5 text-green-400" />
            </div>
            <span className="text-muted-foreground text-sm">Created</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {new Date(project.created_at).toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
