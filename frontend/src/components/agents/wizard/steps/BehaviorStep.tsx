"use client";

import { Info } from "lucide-react";
import { ConfidenceSlider, WorkingHoursConfigPanel } from "@/components/agents/shared";
import { WorkingHoursConfig } from "@/lib/api";

interface BehaviorStepProps {
  autoRespond: boolean;
  confidenceThreshold: number;
  requireApprovalBelow: number;
  maxDailyResponses: number;
  responseDelayMinutes: number;
  workingHours: WorkingHoursConfig | null;
  onAutoRespondChange: (value: boolean) => void;
  onConfidenceThresholdChange: (value: number) => void;
  onRequireApprovalBelowChange: (value: number) => void;
  onMaxDailyResponsesChange: (value: number) => void;
  onResponseDelayMinutesChange: (value: number) => void;
  onWorkingHoursChange: (value: WorkingHoursConfig | null) => void;
}

export function BehaviorStep({
  autoRespond,
  confidenceThreshold,
  requireApprovalBelow,
  maxDailyResponses,
  responseDelayMinutes,
  workingHours,
  onAutoRespondChange,
  onConfidenceThresholdChange,
  onRequireApprovalBelowChange,
  onMaxDailyResponsesChange,
  onResponseDelayMinutesChange,
  onWorkingHoursChange,
}: BehaviorStepProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Behavior Settings
        </h2>
        <p className="text-muted-foreground">
          Configure how your agent should behave, including confidence thresholds
          and response limits.
        </p>
      </div>

      {/* Auto Respond Toggle */}
      <div className="bg-muted rounded-xl p-4 border border-border">
        <label className="flex items-start gap-4 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRespond}
            onChange={(e) => onAutoRespondChange(e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
          />
          <div>
            <div className="font-medium text-foreground">Enable Auto-Response</div>
            <p className="text-sm text-muted-foreground mt-1">
              When enabled, the agent will automatically respond to messages above
              the confidence threshold. Disable to require approval for all responses.
            </p>
          </div>
        </label>
      </div>

      {/* Confidence Thresholds */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-foreground">Confidence Thresholds</h3>

        <ConfidenceSlider
          value={confidenceThreshold}
          onChange={onConfidenceThresholdChange}
          label="Minimum Confidence to Respond"
          description="Agent will only take action if confidence is above this threshold"
        />

        <ConfidenceSlider
          value={requireApprovalBelow}
          onChange={onRequireApprovalBelowChange}
          label="Require Approval Below"
          description="Responses below this confidence level will require human approval"
        />

        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Set approval threshold higher than minimum confidence to create a
            review buffer for uncertain responses.
          </p>
        </div>
      </div>

      {/* Rate Limits */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground">Rate Limits</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Max Daily Responses
            </label>
            <input
              type="number"
              value={maxDailyResponses}
              onChange={(e) => onMaxDailyResponsesChange(parseInt(e.target.value) || 100)}
              min={1}
              max={10000}
              className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Maximum responses per day
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Response Delay (minutes)
            </label>
            <input
              type="number"
              value={responseDelayMinutes}
              onChange={(e) => onResponseDelayMinutesChange(parseInt(e.target.value) || 0)}
              min={0}
              max={1440}
              className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Wait time before sending
            </p>
          </div>
        </div>
      </div>

      {/* Working Hours */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground">Working Hours</h3>
        <WorkingHoursConfigPanel
          value={workingHours}
          onChange={onWorkingHoursChange}
        />
      </div>
    </div>
  );
}
