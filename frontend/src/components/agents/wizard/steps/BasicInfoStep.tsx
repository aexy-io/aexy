"use client";

import { useState, useEffect } from "react";
import { AtSign, Check, X, Loader2, Mail, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCheckMentionHandle } from "@/hooks/useAgents";
import { useEmailDomains } from "@/hooks/useAgentInbox";

interface BasicInfoStepProps {
  workspaceId: string;
  name: string;
  description: string;
  mentionHandle: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onMentionHandleChange: (handle: string) => void;
  // Optional email quick setup
  emailEnabled?: boolean;
  emailHandle?: string;
  emailDomain?: string;
  onEmailEnabledChange?: (enabled: boolean) => void;
  onEmailHandleChange?: (handle: string) => void;
  onEmailDomainChange?: (domain: string) => void;
}

export function BasicInfoStep({
  workspaceId,
  name,
  description,
  mentionHandle,
  onNameChange,
  onDescriptionChange,
  onMentionHandleChange,
  emailEnabled,
  emailHandle,
  emailDomain,
  onEmailEnabledChange,
  onEmailHandleChange,
  onEmailDomainChange,
}: BasicInfoStepProps) {
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [emailExpanded, setEmailExpanded] = useState(emailEnabled || false);
  const { checkHandle, isChecking } = useCheckMentionHandle(workspaceId);
  const { domains, defaultDomain } = useEmailDomains(workspaceId);

  // Show email section if email props are provided
  const showEmailSection = onEmailEnabledChange !== undefined;

  // Debounced handle check
  useEffect(() => {
    if (!mentionHandle) {
      setHandleAvailable(null);
      setHandleError(null);
      return;
    }

    // Validate format
    if (!/^[a-z0-9_-]+$/i.test(mentionHandle)) {
      setHandleError("Only letters, numbers, underscores, and hyphens allowed");
      setHandleAvailable(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const result = await checkHandle({ handle: mentionHandle });
        setHandleAvailable(result.available);
        setHandleError(result.available ? null : "This handle is already taken");
      } catch {
        setHandleError("Failed to check availability");
        setHandleAvailable(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [mentionHandle, checkHandle]);

  // Auto-generate handle from name
  const generateHandle = (inputName: string) => {
    return inputName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
  };

  const handleNameChange = (newName: string) => {
    onNameChange(newName);
    // Auto-generate handle if it hasn't been manually edited
    if (!mentionHandle || mentionHandle === generateHandle(name)) {
      onMentionHandleChange(generateHandle(newName));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Basic Information
        </h2>
        <p className="text-muted-foreground">
          Give your agent a name and description so you can easily identify it.
        </p>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Agent Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., Support Bot, Sales Assistant"
            className="w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
          <p className="mt-1 text-sm text-muted-foreground">
            A descriptive name for your agent
          </p>
        </div>

        {/* Mention Handle */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Mention Handle
          </label>
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={mentionHandle}
              onChange={(e) => onMentionHandleChange(e.target.value.toLowerCase())}
              placeholder="support-bot"
              className={cn(
                "w-full pl-10 pr-10 py-3 bg-accent border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2",
                handleError
                  ? "border-red-500 focus:ring-red-500"
                  : handleAvailable
                  ? "border-green-500 focus:ring-green-500"
                  : "border-border focus:ring-purple-500"
              )}
            />
            {/* Status indicator */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isChecking && (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              )}
              {!isChecking && handleAvailable === true && (
                <Check className="h-4 w-4 text-green-400" />
              )}
              {!isChecking && handleAvailable === false && (
                <X className="h-4 w-4 text-red-400" />
              )}
            </div>
          </div>
          {handleError ? (
            <p className="mt-1 text-sm text-red-400">{handleError}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Users can mention this agent using @{mentionHandle || "handle"}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe what this agent does..."
            rows={3}
            className="w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            Optional description to help you remember this agent's purpose
          </p>
        </div>

        {/* Email Quick Setup (Optional) */}
        {showEmailSection && (
          <div className="border-t border-border pt-4 mt-4">
            <button
              type="button"
              onClick={() => setEmailExpanded(!emailExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-purple-400" />
                <span className="font-medium text-foreground">
                  Quick Email Setup
                </span>
                <span className="text-xs text-muted-foreground">(optional)</span>
              </div>
              {emailExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {emailExpanded && (
              <div className="mt-4 space-y-4 pl-6 border-l-2 border-purple-500/30">
                {/* Enable Email Toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={emailEnabled || false}
                      onChange={(e) => {
                        onEmailEnabledChange?.(e.target.checked);
                        // Auto-set email handle from mention handle
                        if (e.target.checked && !emailHandle && mentionHandle) {
                          onEmailHandleChange?.(mentionHandle);
                        }
                        // Set default domain
                        if (e.target.checked && !emailDomain && defaultDomain) {
                          onEmailDomainChange?.(defaultDomain);
                        }
                      }}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors",
                        emailEnabled ? "bg-purple-500" : "bg-muted"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                        emailEnabled && "translate-x-5"
                      )}
                    />
                  </div>
                  <span className="text-sm text-foreground">
                    Enable email for this agent
                  </span>
                </label>

                {emailEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Email Handle */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Email Handle
                      </label>
                      <input
                        type="text"
                        value={emailHandle || ""}
                        onChange={(e) =>
                          onEmailHandleChange?.(
                            e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                          )
                        }
                        placeholder="support"
                        className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    {/* Domain */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Domain
                      </label>
                      <div className="relative">
                        <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <select
                          value={emailDomain || defaultDomain}
                          onChange={(e) => onEmailDomainChange?.(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 bg-accent border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                        >
                          {domains.map((d) => (
                            <option key={d.domain} value={d.domain}>
                              {d.domain}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {emailEnabled && emailHandle && emailDomain && (
                  <div className="p-2 bg-muted rounded border border-border">
                    <span className="text-xs text-muted-foreground">Email: </span>
                    <code className="text-xs text-blue-400">
                      {emailHandle}@{emailDomain}
                    </code>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
