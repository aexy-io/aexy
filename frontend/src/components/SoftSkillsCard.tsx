"use client";

import { MessageSquare, Users, GraduationCap, Crown } from "lucide-react";
import { SoftSkillsProfile } from "@/lib/api";

interface SoftSkillsCardProps {
  softSkills: SoftSkillsProfile | null;
  isLoading?: boolean;
}

export function SoftSkillsCard({ softSkills, isLoading }: SoftSkillsCardProps) {
  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!softSkills) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Soft Skills</h3>
        <p className="text-slate-400 text-sm">
          Soft skills analysis not available yet.
          More activity is needed for analysis.
        </p>
      </div>
    );
  }

  const skills = [
    {
      name: "Communication",
      score: softSkills.communication_score,
      icon: MessageSquare,
      color: "text-blue-400",
      bgColor: "bg-blue-500",
    },
    {
      name: "Collaboration",
      score: softSkills.collaboration_score,
      icon: Users,
      color: "text-green-400",
      bgColor: "bg-green-500",
    },
    {
      name: "Mentorship",
      score: softSkills.mentorship_score,
      icon: GraduationCap,
      color: "text-purple-400",
      bgColor: "bg-purple-500",
    },
    {
      name: "Leadership",
      score: softSkills.leadership_score,
      icon: Crown,
      color: "text-amber-400",
      bgColor: "bg-amber-500",
    },
  ];

  const overallScore = (
    softSkills.communication_score * 0.3 +
    softSkills.collaboration_score * 0.3 +
    softSkills.mentorship_score * 0.2 +
    softSkills.leadership_score * 0.2
  );

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Soft Skills</h3>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">
            {Math.round(overallScore * 100)}%
          </div>
          <div className="text-xs text-slate-400">Overall</div>
        </div>
      </div>

      <div className="space-y-4">
        {skills.map((skill) => {
          const Icon = skill.icon;
          const percentage = Math.round(skill.score * 100);

          return (
            <div key={skill.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${skill.color}`} />
                  <span className="text-sm text-white">{skill.name}</span>
                </div>
                <span className="text-sm text-slate-400">{percentage}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${skill.bgColor} rounded-full transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {softSkills.samples_analyzed > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            Based on {softSkills.samples_analyzed} samples analyzed
          </p>
        </div>
      )}
    </div>
  );
}
