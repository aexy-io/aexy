"use client";

import { useMemo } from "react";

interface DeveloperSkill {
  developer_id: string;
  developer_name: string;
  skills: { skill: string; value: number }[];
}

interface SkillHeatmapProps {
  data: {
    skills: string[];
    developer_skills: DeveloperSkill[];
  } | null;
  isLoading?: boolean;
}

export function SkillHeatmap({ data, isLoading }: SkillHeatmapProps) {
  const { skills, developerSkills } = useMemo(() => {
    if (!data) return { skills: [], developerSkills: [] };
    return {
      skills: data.skills,
      developerSkills: data.developer_skills,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-64 bg-accent rounded-lg" />
      </div>
    );
  }

  if (!data || skills.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No skill data available
      </div>
    );
  }

  const getColorClass = (value: number) => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-green-400";
    if (value >= 40) return "bg-yellow-400";
    if (value >= 20) return "bg-orange-400";
    if (value > 0) return "bg-red-400";
    return "bg-accent";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-muted px-3 py-2 text-left text-muted-foreground font-medium">
              Developer
            </th>
            {skills.map((skill) => (
              <th
                key={skill}
                className="px-2 py-2 text-center text-muted-foreground font-medium whitespace-nowrap"
                style={{ writingMode: "vertical-rl", maxWidth: "2rem" }}
              >
                {skill}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {developerSkills.map((dev) => {
            const skillMap = new Map(
              dev.skills.map((s) => [s.skill, s.value])
            );
            return (
              <tr key={dev.developer_id} className="border-t border-border">
                <td className="sticky left-0 bg-muted px-3 py-2 text-foreground font-medium whitespace-nowrap">
                  {dev.developer_name}
                </td>
                {skills.map((skill) => {
                  const value = skillMap.get(skill) || 0;
                  return (
                    <td key={skill} className="px-1 py-1">
                      <div
                        className={`w-8 h-8 rounded ${getColorClass(value)} flex items-center justify-center text-xs font-medium ${
                          value > 50 ? "text-foreground" : "text-foreground"
                        }`}
                        title={`${dev.developer_name}: ${skill} - ${value}%`}
                      >
                        {value > 0 ? value : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <span>Proficiency:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-red-400" />
          <span>1-20%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-orange-400" />
          <span>21-40%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-yellow-400" />
          <span>41-60%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-green-400" />
          <span>61-80%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-green-500" />
          <span>81-100%</span>
        </div>
      </div>
    </div>
  );
}
