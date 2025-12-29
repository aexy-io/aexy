"use client";

import { TrendingUp, TrendingDown, Zap } from "lucide-react";
import { GrowthTrajectory } from "@/lib/api";

interface GrowthTrajectoryCardProps {
  growth: GrowthTrajectory | null;
}

export function GrowthTrajectoryCard({ growth }: GrowthTrajectoryCardProps) {
  if (!growth) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Growth Trajectory</h3>
        <p className="text-slate-400 text-sm">
          Not enough data to show growth trajectory.
        </p>
      </div>
    );
  }

  const velocityLevel = growth.learning_velocity > 1
    ? "High"
    : growth.learning_velocity > 0.5
      ? "Moderate"
      : "Low";

  const velocityColor = growth.learning_velocity > 1
    ? "text-green-400"
    : growth.learning_velocity > 0.5
      ? "text-amber-400"
      : "text-slate-400";

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Growth Trajectory</h3>
        <div className={`flex items-center gap-1 ${velocityColor}`}>
          <Zap className="h-4 w-4" />
          <span className="text-sm">{velocityLevel} velocity</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Skills Acquired */}
        {growth.skills_acquired_6m.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-sm text-slate-300">
                Skills acquired (last 6 months)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {growth.skills_acquired_6m.map((skill) => (
                <span
                  key={skill}
                  className="bg-green-900/30 text-green-300 px-2 py-1 rounded text-xs"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Skills Declining */}
        {growth.skills_declining.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-sm text-slate-300">Skills declining</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {growth.skills_declining.map((skill) => (
                <span
                  key={skill}
                  className="bg-red-900/30 text-red-300 px-2 py-1 rounded text-xs"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* No changes */}
        {growth.skills_acquired_6m.length === 0 &&
         growth.skills_declining.length === 0 && (
          <p className="text-slate-400 text-sm">
            Your skill profile has been stable recently.
          </p>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Learning velocity</span>
          <span className="text-white">
            {growth.learning_velocity.toFixed(2)} skills/month
          </span>
        </div>
      </div>
    </div>
  );
}
