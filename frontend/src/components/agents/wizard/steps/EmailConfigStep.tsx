"use client";

import { useState, useEffect } from "react";
import { Mail, Globe, AtSign, MessageSquare, FileText, Info } from "lucide-react";
import { useEmailDomains } from "@/hooks/useAgentInbox";
import { cn } from "@/lib/utils";

interface EmailConfigStepProps {
  workspaceId: string;
  agentName: string;
  mentionHandle: string;
  emailEnabled: boolean;
  emailHandle: string;
  emailDomain: string;
  autoReplyEnabled: boolean;
  emailSignature: string;
  onEmailEnabledChange: (enabled: boolean) => void;
  onEmailHandleChange: (handle: string) => void;
  onEmailDomainChange: (domain: string) => void;
  onAutoReplyEnabledChange: (enabled: boolean) => void;
  onEmailSignatureChange: (signature: string) => void;
}

export function EmailConfigStep({
  workspaceId,
  agentName,
  mentionHandle,
  emailEnabled,
  emailHandle,
  emailDomain,
  autoReplyEnabled,
  emailSignature,
  onEmailEnabledChange,
  onEmailHandleChange,
  onEmailDomainChange,
  onAutoReplyEnabledChange,
  onEmailSignatureChange,
}: EmailConfigStepProps) {
  const { domains, defaultDomain, isLoading } = useEmailDomains(workspaceId);
  const [localHandle, setLocalHandle] = useState(emailHandle);

  // Initialize handle from mentionHandle or agentName
  useEffect(() => {
    if (!emailHandle && emailEnabled) {
      const suggestedHandle = mentionHandle || agentName.toLowerCase().replace(/\s+/g, "-");
      const cleanHandle = suggestedHandle.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
      setLocalHandle(cleanHandle);
      onEmailHandleChange(cleanHandle);
    }
  }, [emailEnabled, mentionHandle, agentName, emailHandle, onEmailHandleChange]);

  // Initialize domain
  useEffect(() => {
    if (!emailDomain && defaultDomain) {
      onEmailDomainChange(defaultDomain);
    }
  }, [defaultDomain, emailDomain, onEmailDomainChange]);

  const handleLocalHandleChange = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setLocalHandle(cleanValue);
    onEmailHandleChange(cleanValue);
  };

  const previewEmail = localHandle && emailDomain ? `${localHandle}@${emailDomain}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Email Configuration</h2>
        <p className="text-muted-foreground">
          Enable email for this agent to receive and respond to emails automatically.
        </p>
      </div>

      {/* Enable Email Toggle */}
      <div className="bg-accent/50 rounded-xl p-6 border border-border">
        <label className="flex items-start gap-4 cursor-pointer">
          <div className="relative mt-1">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => onEmailEnabledChange(e.target.checked)}
              className="sr-only"
            />
            <div
              className={cn(
                "w-11 h-6 rounded-full transition-colors",
                emailEnabled ? "bg-purple-500" : "bg-muted"
              )}
            />
            <div
              className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                emailEnabled && "translate-x-5"
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-purple-400" />
              <span className="font-medium text-foreground">Enable Email</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Give this agent its own email address to receive and process emails
            </p>
          </div>
        </label>
      </div>

      {emailEnabled && (
        <>
          {/* Email Address Configuration */}
          <div className="bg-accent/50 rounded-xl p-6 border border-border space-y-4">
            <h3 className="font-medium text-foreground flex items-center gap-2">
              <AtSign className="h-4 w-4 text-blue-400" />
              Email Address
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Handle Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Email Handle
                </label>
                <input
                  type="text"
                  value={localHandle}
                  onChange={(e) => handleLocalHandleChange(e.target.value)}
                  placeholder="support"
                  className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Letters, numbers, and hyphens only
                </p>
              </div>

              {/* Domain Selector */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Domain
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <select
                    value={emailDomain}
                    onChange={(e) => onEmailDomainChange(e.target.value)}
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                  >
                    {domains.map((d) => (
                      <option key={d.domain} value={d.domain}>
                        {d.domain} {d.is_default && "(Default)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Email Preview */}
            {previewEmail && (
              <div className="mt-4 p-3 bg-muted rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-muted-foreground">Email address preview:</span>
                </div>
                <code className="block mt-1 text-blue-400 font-mono">{previewEmail}</code>
              </div>
            )}
          </div>

          {/* Auto-Reply Settings */}
          <div className="bg-accent/50 rounded-xl p-6 border border-border">
            <label className="flex items-start gap-4 cursor-pointer">
              <div className="relative mt-1">
                <input
                  type="checkbox"
                  checked={autoReplyEnabled}
                  onChange={(e) => onAutoReplyEnabledChange(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={cn(
                    "w-11 h-6 rounded-full transition-colors",
                    autoReplyEnabled ? "bg-purple-500" : "bg-muted"
                  )}
                />
                <div
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                    autoReplyEnabled && "translate-x-5"
                  )}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-green-400" />
                  <span className="font-medium text-foreground">Enable Auto-Reply</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Automatically respond to emails when AI confidence is above threshold
                </p>
              </div>
            </label>
          </div>

          {/* Email Signature */}
          <div className="bg-accent/50 rounded-xl p-6 border border-border space-y-3">
            <label className="flex items-center gap-2 font-medium text-foreground">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Email Signature
            </label>
            <textarea
              value={emailSignature}
              onChange={(e) => onEmailSignatureChange(e.target.value)}
              rows={4}
              placeholder={`Best regards,\n${agentName}`}
              className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <p className="text-sm text-muted-foreground">
              This signature will be appended to all outgoing emails from this agent.
              Use {"{agent_name}"} to insert the agent name dynamically.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
