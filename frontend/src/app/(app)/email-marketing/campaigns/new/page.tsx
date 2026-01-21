"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Mail,
  Loader2,
  AlertCircle,
  Users,
  FileText,
  Send,
  Clock,
  Upload,
  Tag,
  Check,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useEmailTemplates, useEmailCampaigns, useSubscriptionCategories, useImportSubscribers } from "@/hooks/useEmailMarketing";
import { EmailCampaignCreate, CampaignType, FilterCondition } from "@/lib/api";

type Step = "details" | "content" | "audience" | "review";

export default function NewCampaignPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const workspaceId = currentWorkspace?.id || null;

  const [currentStep, setCurrentStep] = useState<Step>("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [campaignType, setCampaignType] = useState<CampaignType>("one_time");
  const [templateId, setTemplateId] = useState<string>("");
  const [htmlContent, setHtmlContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "segment" | "list">("all");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [emailListText, setEmailListText] = useState("");

  const { templates, isLoading: templatesLoading } = useEmailTemplates(workspaceId);
  const { createCampaign } = useEmailCampaigns(workspaceId);
  const { categories, isLoading: categoriesLoading } = useSubscriptionCategories(workspaceId);
  const importSubscribers = useImportSubscribers(workspaceId);

  // Parse email list from textarea
  const parsedEmails = useMemo(() => {
    if (!emailListText.trim()) return [];
    // Split by newlines, commas, or semicolons and filter valid emails
    const emails = emailListText
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    return [...new Set(emails)]; // Remove duplicates
  }, [emailListText]);

  const steps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: "details", label: "Details", icon: Mail },
    { id: "content", label: "Content", icon: FileText },
    { id: "audience", label: "Audience", icon: Users },
    { id: "review", label: "Review", icon: Send },
  ];

  const handleSubmit = async (sendNow: boolean = false) => {
    if (!workspaceId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Build audience filters based on selection
      let audienceFilters: FilterCondition[] | undefined;
      let recipientEmails: string[] | undefined;

      if (audienceType === "segment" && selectedCategoryIds.length > 0) {
        audienceFilters = [{
          attribute: "category_id",
          operator: "in",
          value: selectedCategoryIds,
        }];
      } else if (audienceType === "list" && parsedEmails.length > 0) {
        recipientEmails = parsedEmails;
      }

      const data: EmailCampaignCreate = {
        name,
        subject,
        preview_text: previewText || undefined,
        from_name: fromName,
        from_email: fromEmail,
        campaign_type: campaignType,
        template_id: templateId || undefined,
        html_content: htmlContent || undefined,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        audience_filters: audienceFilters,
        recipient_emails: recipientEmails,
      };

      const campaign = await createCampaign(data);

      if (sendNow) {
        router.push(`/email-marketing/campaigns/${campaign.id}?action=send`);
      } else {
        router.push(`/email-marketing/campaigns/${campaign.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case "details":
        return name && subject && fromName && fromEmail;
      case "content":
        return templateId || htmlContent;
      case "audience":
        // Validate based on audience type
        if (audienceType === "segment") {
          return selectedCategoryIds.length > 0;
        }
        if (audienceType === "list") {
          return parsedEmails.length > 0;
        }
        return true; // "all" is always valid
      case "review":
        return true;
      default:
        return false;
    }
  };

  const goToNextStep = () => {
    const stepIndex = steps.findIndex((s) => s.id === currentStep);
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1].id);
    }
  };

  const goToPrevStep = () => {
    const stepIndex = steps.findIndex((s) => s.id === currentStep);
    if (stepIndex > 0) {
      setCurrentStep(steps[stepIndex - 1].id);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Workspace Selected</h2>
            <p className="text-slate-400">Please select a workspace to create a campaign.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
<div className="p-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => router.push("/email-marketing/campaigns")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Create Campaign</h1>
              <p className="text-sm text-slate-400">Set up your email campaign</p>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mb-8">
            {steps.map((step, index) => {
              const isActive = step.id === currentStep;
              const isPast = steps.findIndex((s) => s.id === currentStep) > index;
              const Icon = step.icon;

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => isPast && setCurrentStep(step.id)}
                    disabled={!isPast}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                      isActive
                        ? "bg-sky-500 text-white"
                        : isPast
                        ? "bg-slate-800 text-white cursor-pointer hover:bg-slate-700"
                        : "bg-slate-900 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{step.label}</span>
                  </button>
                  {index < steps.length - 1 && (
                    <div className={`w-8 h-0.5 mx-1 ${isPast ? "bg-sky-500" : "bg-slate-800"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Step Content */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            {currentStep === "details" && (
              <div className="space-y-6">
                <h2 className="text-lg font-medium text-white">Campaign Details</h2>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Campaign Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Weekly Newsletter"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Subject Line *</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Your weekly update is here!"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Preview Text</label>
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Brief preview shown in inbox"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">From Name *</label>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="Your Company"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">From Email *</label>
                    <input
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="hello@example.com"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Campaign Type</label>
                  <div className="flex gap-4">
                    {[
                      { value: "one_time", label: "One-time", desc: "Send once to all recipients" },
                      { value: "triggered", label: "Triggered", desc: "Send based on events" },
                      { value: "recurring", label: "Recurring", desc: "Send on a schedule" },
                    ].map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setCampaignType(type.value as CampaignType)}
                        className={`flex-1 p-4 rounded-lg border transition text-left ${
                          campaignType === type.value
                            ? "bg-sky-500/20 border-sky-500 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <p className="font-medium">{type.label}</p>
                        <p className="text-xs text-slate-400 mt-1">{type.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {currentStep === "content" && (
              <div className="space-y-6">
                <h2 className="text-lg font-medium text-white">Email Content</h2>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Choose a Template</label>
                  {templatesLoading ? (
                    <div className="p-8 text-center">
                      <Loader2 className="h-6 w-6 text-slate-500 animate-spin mx-auto" />
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="p-6 bg-slate-800/50 rounded-lg text-center">
                      <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400 mb-2">No templates available</p>
                      <Link
                        href="/email-marketing/templates/new"
                        className="text-sky-400 hover:text-sky-300 text-sm"
                      >
                        Create a template
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {templates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => setTemplateId(template.id)}
                          className={`p-4 rounded-lg border transition text-left ${
                            templateId === template.id
                              ? "bg-sky-500/20 border-sky-500 text-white"
                              : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                          }`}
                        >
                          <p className="font-medium">{template.name}</p>
                          <p className="text-xs text-slate-500 mt-1">{template.template_type}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-700" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 bg-slate-900 text-slate-500 text-sm">or</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Custom HTML Content</label>
                  <textarea
                    value={htmlContent}
                    onChange={(e) => {
                      setHtmlContent(e.target.value);
                      if (e.target.value) setTemplateId("");
                    }}
                    placeholder="<html>...</html>"
                    rows={10}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                  />
                </div>
              </div>
            )}

            {currentStep === "audience" && (
              <div className="space-y-6">
                <h2 className="text-lg font-medium text-white">Select Audience</h2>

                <div className="space-y-3">
                  {[
                    { value: "all", label: "All Subscribers", desc: "Send to your entire subscriber list", icon: Users },
                    { value: "segment", label: "Segment", desc: "Target specific subscriber categories", icon: Tag },
                    { value: "list", label: "Upload List", desc: "Paste a custom recipient list", icon: Upload },
                  ].map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setAudienceType(option.value as "all" | "segment" | "list")}
                        className={`w-full p-4 rounded-lg border transition text-left flex items-center gap-4 ${
                          audienceType === option.value
                            ? "bg-sky-500/20 border-sky-500 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${
                          audienceType === option.value ? "bg-sky-500/30" : "bg-slate-700"
                        }`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{option.label}</p>
                          <p className="text-sm text-slate-400">{option.desc}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          audienceType === option.value ? "border-sky-500 bg-sky-500" : "border-slate-600"
                        }`}>
                          {audienceType === option.value && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Segment Selection */}
                {audienceType === "segment" && (
                  <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <label className="block text-sm text-slate-400 mb-3">Select Categories</label>
                    {categoriesLoading ? (
                      <div className="p-4 text-center">
                        <Loader2 className="h-5 w-5 text-slate-500 animate-spin mx-auto" />
                      </div>
                    ) : categories.length === 0 ? (
                      <div className="p-4 text-center">
                        <Tag className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm">No subscription categories found</p>
                        <Link
                          href="/email-marketing/settings"
                          className="text-sky-400 hover:text-sky-300 text-sm"
                        >
                          Create categories in settings
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {categories.filter(c => c.is_active).map((category) => (
                          <label
                            key={category.id}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${
                              selectedCategoryIds.includes(category.id)
                                ? "bg-sky-500/20 border border-sky-500/30"
                                : "bg-slate-800 border border-slate-700 hover:border-slate-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedCategoryIds.includes(category.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCategoryIds([...selectedCategoryIds, category.id]);
                                } else {
                                  setSelectedCategoryIds(selectedCategoryIds.filter(id => id !== category.id));
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                            />
                            <div>
                              <p className="text-white font-medium">{category.name}</p>
                              {category.description && (
                                <p className="text-slate-400 text-sm">{category.description}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {selectedCategoryIds.length > 0 && (
                      <p className="text-sm text-sky-400 mt-3">
                        {selectedCategoryIds.length} categor{selectedCategoryIds.length === 1 ? "y" : "ies"} selected
                      </p>
                    )}
                  </div>
                )}

                {/* Upload List */}
                {audienceType === "list" && (
                  <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <label className="block text-sm text-slate-400 mb-3">Paste Email Addresses</label>
                    <textarea
                      value={emailListText}
                      onChange={(e) => setEmailListText(e.target.value)}
                      placeholder="Enter email addresses (one per line, or comma/semicolon separated)&#10;&#10;example@email.com&#10;another@email.com"
                      rows={8}
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-slate-500">
                        Separate emails with newlines, commas, or semicolons
                      </p>
                      {parsedEmails.length > 0 && (
                        <p className="text-sm text-sky-400">
                          {parsedEmails.length} valid email{parsedEmails.length === 1 ? "" : "s"} found
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800">
                  <label className="block text-sm text-slate-400 mb-2">Schedule (Optional)</label>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-slate-400" />
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Leave empty to save as draft or send immediately
                  </p>
                </div>
              </div>
            )}

            {currentStep === "review" && (
              <div className="space-y-6">
                <h2 className="text-lg font-medium text-white">Review Campaign</h2>

                <div className="space-y-4">
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Campaign Name</p>
                    <p className="text-white">{name}</p>
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Subject</p>
                    <p className="text-white">{subject}</p>
                    {previewText && (
                      <p className="text-slate-400 text-sm mt-1">{previewText}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-800/50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">From</p>
                      <p className="text-white">{fromName}</p>
                      <p className="text-slate-400 text-sm">{fromEmail}</p>
                    </div>
                    <div className="p-4 bg-slate-800/50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Type</p>
                      <p className="text-white capitalize">{campaignType.replace("_", " ")}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Content</p>
                    <p className="text-white">
                      {templateId
                        ? `Using template: ${templates.find((t) => t.id === templateId)?.name}`
                        : htmlContent
                        ? "Custom HTML content"
                        : "No content selected"}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Audience</p>
                    {audienceType === "all" && (
                      <p className="text-white">All Subscribers</p>
                    )}
                    {audienceType === "segment" && (
                      <>
                        <p className="text-white">Segment: {selectedCategoryIds.length} categor{selectedCategoryIds.length === 1 ? "y" : "ies"}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedCategoryIds.map((id) => {
                            const cat = categories.find(c => c.id === id);
                            return cat ? (
                              <span key={id} className="px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded text-xs">
                                {cat.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </>
                    )}
                    {audienceType === "list" && (
                      <p className="text-white">Custom List: {parsedEmails.length} recipient{parsedEmails.length === 1 ? "" : "s"}</p>
                    )}
                  </div>

                  {scheduledAt && (
                    <div className="p-4 bg-slate-800/50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Scheduled For</p>
                      <p className="text-white">{new Date(scheduledAt).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={goToPrevStep}
              disabled={currentStep === "details"}
              className="px-4 py-2 text-slate-400 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              {currentStep === "review" ? (
                <>
                  <button
                    onClick={() => handleSubmit(false)}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save as Draft"
                    )}
                  </button>
                  <button
                    onClick={() => handleSubmit(true)}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        {scheduledAt ? "Schedule Campaign" : "Send Now"}
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={goToNextStep}
                  disabled={!canProceed()}
                  className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
