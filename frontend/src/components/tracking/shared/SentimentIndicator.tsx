"use client";

import { Smile, Meh, Frown, TrendingUp, TrendingDown, Minus } from "lucide-react";

export type SentimentLevel = "positive" | "neutral" | "negative";

interface SentimentIndicatorProps {
  score: number; // 0-1 scale
  showBar?: boolean;
  showEmoji?: boolean;
  showLabel?: boolean;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  trend?: number; // Change from previous period (-1 to 1)
  className?: string;
}

const sentimentConfig = {
  positive: {
    emoji: Smile,
    label: "Positive",
    color: "text-green-400",
    bgColor: "bg-green-500",
    bgLight: "bg-green-900/30",
    borderColor: "border-green-700/50",
  },
  neutral: {
    emoji: Meh,
    label: "Neutral",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500",
    bgLight: "bg-yellow-900/30",
    borderColor: "border-yellow-700/50",
  },
  negative: {
    emoji: Frown,
    label: "Negative",
    color: "text-red-400",
    bgColor: "bg-red-500",
    bgLight: "bg-red-900/30",
    borderColor: "border-red-700/50",
  },
};

function getSentimentLevel(score: number): SentimentLevel {
  if (score >= 0.6) return "positive";
  if (score >= 0.4) return "neutral";
  return "negative";
}

const sizeConfig = {
  sm: {
    emoji: "h-4 w-4",
    text: "text-xs",
    bar: "h-1",
  },
  md: {
    emoji: "h-5 w-5",
    text: "text-sm",
    bar: "h-1.5",
  },
  lg: {
    emoji: "h-6 w-6",
    text: "text-base",
    bar: "h-2",
  },
};

export function SentimentIndicator({
  score,
  showBar = true,
  showEmoji = true,
  showLabel = false,
  showPercentage = true,
  size = "md",
  trend,
  className = "",
}: SentimentIndicatorProps) {
  const level = getSentimentLevel(score);
  const config = sentimentConfig[level];
  const sizes = sizeConfig[size];
  const EmojiIcon = config.emoji;

  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0.05) return TrendingUp;
    if (trend < -0.05) return TrendingDown;
    return Minus;
  };

  const TrendIcon = getTrendIcon();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showEmoji && (
        <div className={`p-1.5 ${config.bgLight} rounded-lg`}>
          <EmojiIcon className={`${sizes.emoji} ${config.color}`} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {showLabel && (
          <span className={`${sizes.text} ${config.color} font-medium`}>{config.label}</span>
        )}

        {showBar && (
          <div className={`w-full ${sizes.bar} bg-accent rounded-full overflow-hidden`}>
            <div
              className={`h-full rounded-full transition-all ${config.bgColor}`}
              style={{ width: `${Math.round(score * 100)}%` }}
            />
          </div>
        )}
      </div>

      {showPercentage && (
        <span className={`${sizes.text} text-muted-foreground tabular-nums`}>
          {Math.round(score * 100)}%
        </span>
      )}

      {TrendIcon && (
        <TrendIcon
          className={`${sizes.emoji} ${
            trend && trend > 0 ? "text-green-400" : trend && trend < 0 ? "text-red-400" : "text-muted-foreground"
          }`}
        />
      )}
    </div>
  );
}

// Compact badge version
export function SentimentBadge({
  score,
  size = "sm",
}: {
  score: number;
  size?: "sm" | "md";
}) {
  const level = getSentimentLevel(score);
  const config = sentimentConfig[level];
  const EmojiIcon = config.emoji;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 ${config.bgLight} border ${config.borderColor} rounded-full`}
    >
      <EmojiIcon className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} ${config.color}`} />
      <span className={`${size === "sm" ? "text-xs" : "text-sm"} ${config.color}`}>
        {Math.round(score * 100)}%
      </span>
    </span>
  );
}

// Team sentiment overview component
export function TeamSentimentOverview({
  scores,
  showDistribution = true,
}: {
  scores: number[];
  showDistribution?: boolean;
}) {
  if (scores.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No sentiment data available</div>
    );
  }

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  const distribution = {
    positive: scores.filter((s) => s >= 0.6).length,
    neutral: scores.filter((s) => s >= 0.4 && s < 0.6).length,
    negative: scores.filter((s) => s < 0.4).length,
  };

  return (
    <div className="space-y-3">
      <SentimentIndicator score={average} showLabel showEmoji showBar size="lg" />

      {showDistribution && (
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(distribution) as SentimentLevel[]).map((level) => {
            const config = sentimentConfig[level];
            const count = distribution[level];
            const percentage = Math.round((count / scores.length) * 100);

            return (
              <div key={level} className={`p-2 ${config.bgLight} rounded-lg text-center`}>
                <p className={`text-lg font-semibold ${config.color}`}>{count}</p>
                <p className="text-xs text-muted-foreground">
                  {config.label} ({percentage}%)
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
