"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
  label?: string;
  sublabel?: string;
  color?: "primary" | "success" | "warning" | "danger" | "purple";
  animated?: boolean;
}

const colorClasses = {
  primary: "stroke-blue-500",
  success: "stroke-green-500",
  warning: "stroke-amber-500",
  danger: "stroke-red-500",
  purple: "stroke-purple-500",
};

const bgColorClasses = {
  primary: "stroke-blue-100",
  success: "stroke-green-100",
  warning: "stroke-amber-100",
  danger: "stroke-red-100",
  purple: "stroke-purple-100",
};

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  className,
  showLabel = true,
  label,
  sublabel,
  color = "primary",
  animated = true,
}: ProgressRingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Calculate dimensions
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference;

  // Animate progress on mount and when progress changes
  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setAnimatedProgress(progress);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setAnimatedProgress(progress);
    }
  }, [progress, animated]);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={bgColorClasses[color]}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn(colorClasses[color], animated && "transition-all duration-1000 ease-out")}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
        />
      </svg>

      {/* Center content */}
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">
            {label || `${Math.round(animatedProgress)}%`}
          </span>
          {sublabel && (
            <span className="text-xs text-gray-500 mt-0.5">{sublabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Compact version for inline use
interface MiniProgressRingProps {
  progress: number;
  size?: number;
  className?: string;
  color?: "primary" | "success" | "warning" | "danger" | "purple";
}

export function MiniProgressRing({
  progress,
  size = 24,
  className,
  color = "primary",
}: MiniProgressRingProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className={cn("transform -rotate-90", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className={bgColorClasses[color]}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={colorClasses[color]}
        style={{
          strokeDasharray: circumference,
          strokeDashoffset,
        }}
      />
    </svg>
  );
}
