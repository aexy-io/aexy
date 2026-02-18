"use client";

interface TeamHealthData {
  team_id?: string | null;
  health_score: number;
  health_grade: string;
  strengths: string[];
  risks: { risk: string; severity: string; mitigation: string }[];
  capacity_assessment: {
    current_utilization: number;
    sustainable_velocity: boolean;
    bottlenecks: string[];
  };
  recommendations: string[];
  suggested_hires: string[];
}

interface TeamHealthGaugeProps {
  data: TeamHealthData | null;
  isLoading?: boolean;
}

export function TeamHealthGauge({ data, isLoading }: TeamHealthGaugeProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-48 bg-accent rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No health data available
      </div>
    );
  }

  const scorePercentage = data.health_score * 100;

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A":
        return "text-green-400";
      case "B":
        return "text-green-300";
      case "C":
        return "text-yellow-400";
      case "D":
        return "text-orange-400";
      case "F":
        return "text-red-400";
      default:
        return "text-muted-foreground";
    }
  };

  const getGaugeFill = (score: number) => {
    if (score >= 80) return "#10B981";
    if (score >= 60) return "#22C55E";
    if (score >= 40) return "#F59E0B";
    if (score >= 20) return "#F97316";
    return "#EF4444";
  };

  // Calculate arc for gauge
  const gaugeAngle = (scorePercentage / 100) * 180;
  const endX = 100 + 80 * Math.cos(((180 - gaugeAngle) * Math.PI) / 180);
  const endY = 100 - 80 * Math.sin(((180 - gaugeAngle) * Math.PI) / 180);

  return (
    <div className="text-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-xs mx-auto">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#374151"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M 20 100 A 80 80 0 ${gaugeAngle > 90 ? 1 : 0} 1 ${endX} ${endY}`}
          fill="none"
          stroke={getGaugeFill(scorePercentage)}
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Center text */}
        <text
          x="100"
          y="85"
          textAnchor="middle"
          className="text-3xl font-bold"
          fill="white"
        >
          {scorePercentage.toFixed(0)}
        </text>
        <text
          x="100"
          y="105"
          textAnchor="middle"
          className="text-sm"
          fill="#9CA3AF"
        >
          / 100
        </text>
      </svg>

      <div className="mt-4">
        <span className={`text-4xl font-bold ${getGradeColor(data.health_grade)}`}>
          {data.health_grade}
        </span>
        <span className="text-muted-foreground ml-2">Grade</span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
        <div className="bg-accent/50 rounded-lg p-3">
          <div className="text-muted-foreground">Utilization</div>
          <div className="text-foreground font-semibold">
            {(data.capacity_assessment.current_utilization * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-accent/50 rounded-lg p-3">
          <div className="text-muted-foreground">Velocity</div>
          <div
            className={`font-semibold ${
              data.capacity_assessment.sustainable_velocity
                ? "text-green-400"
                : "text-red-400"
            }`}
          >
            {data.capacity_assessment.sustainable_velocity
              ? "Sustainable"
              : "At Risk"}
          </div>
        </div>
      </div>
    </div>
  );
}
