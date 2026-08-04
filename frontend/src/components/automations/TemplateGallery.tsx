"use client";

import { getApiErrorMessage } from "@/lib/utils";
import * as React from "react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  ChevronLeft,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { automationsApi, AutomationModule, GeneratedWorkflow } from "@/lib/api";
import {
  AutomationTemplate,
  CRM_AUTOMATION_MODULES,
  CRM_TEMPLATE_LIST,
  moduleAccentHex,
  moduleColors,
  moduleIcons,
  moduleLabels,
} from "@/lib/automationTemplates";
import { cn } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";

interface TemplateGalleryProps {
  /** When set, the gallery pre-filters to this module's templates. */
  initialModule?: AutomationModule | null;
  /** Workspace context for the generate-from-prompt call. Optional so
   *  the component can render in storybooks without an active workspace. */
  workspaceId?: string | null;
  /** Triggered when the user picks a ready-made template. */
  onUseTemplate: (template: AutomationTemplate) => void;
  /** Triggered when the user opts to skip the gallery entirely. */
  onStartBlank: () => void;
  /** Triggered when the LLM returns a valid generated workflow. The
   *  parent typically flips into canvas mode and seeds the nodes/edges
   *  from the payload. UX-DEF-004. */
  onUseGenerated?: (workflow: GeneratedWorkflow) => void;
  /** Optional "back" affordance — typically returns to /automations. */
  onBack?: () => void;
}

/**
 * First-run entry for /automations/new.
 *
 * Replaces the blank React Flow canvas that the audit flagged as a
 * cold-start cliff. Users see a curated template grid first; only after
 * picking one (or hitting "Start blank") do they enter the canvas.
 *
 * Visual language: each card carries the module's brand color in its
 * trigger glyph + connector trace, not in the card background — so the
 * grid stays calm but you can still scan for "all the CRM ones" at a
 * glance. The mini trace below each card name (trigger → action chips)
 * is the distinctive moment.
 */
export function TemplateGallery({
  initialModule,
  workspaceId,
  onUseTemplate,
  onStartBlank,
  onUseGenerated,
  onBack,
}: TemplateGalleryProps) {
  const t = useTranslations("automations.gallery");

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<AutomationModule | "all">(
    // Honour whichever module the caller arrived with; the gallery used to
    // force CRM because the other modules' templates were unusable.
    initialModule ?? "all",
  );

  // UX-DEF-004: prompt-to-workflow state. Lives in this component
  // because the whole flow (input + LLM call + handoff) is gallery-
  // local — the only thing that escapes is the resolved workflow,
  // which fires through onUseGenerated.
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate = !!onUseGenerated && !!workspaceId;

  const handleGenerate = async () => {
    if (!canGenerate || !workspaceId) return;
    const trimmed = prompt.trim();
    if (trimmed.length < 8) {
      toast.error("Describe what the automation should do (at least one sentence)");
      return;
    }
    setIsGenerating(true);
    try {
      const workflow = await automationsApi.generateWorkflowFromPrompt(workspaceId, {
        prompt: trimmed,
        module: moduleFilter === "all" ? undefined : moduleFilter,
      });
      onUseGenerated?.(workflow);
    } catch (err: unknown) {
      // 422 = LLM returned an unusable shape; 500 = generation failed.
      // Either way the user retries with a clearer prompt or falls
      // back to a template.
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (getApiErrorMessage(err, "Generation failed"));
      toast.error(detail);
    } finally {
      setIsGenerating(false);
    }
  };

  const filtered = useMemo<AutomationTemplate[]>(() => {
    const term = search.trim().toLowerCase();
    return CRM_TEMPLATE_LIST.filter((tmpl) => {
      if (moduleFilter !== "all" && tmpl.module !== moduleFilter) return false;
      if (!term) return true;
      return (
        tmpl.name.toLowerCase().includes(term) ||
        tmpl.description.toLowerCase().includes(term) ||
        moduleLabels[tmpl.module].toLowerCase().includes(term)
      );
    });
  }, [search, moduleFilter]);

  const modulesPresent = useMemo<AutomationModule[]>(() => {
    const seen = new Set<AutomationModule>();
    CRM_TEMPLATE_LIST.forEach((tmpl) => seen.add(tmpl.module));
    return CRM_AUTOMATION_MODULES.filter((m) => seen.has(m));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header strip — back + lockup */}
        <div className="flex items-start gap-3 mb-8 sm:mb-10">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mt-1 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              aria-label={t("back")}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full mb-3">
              <Sparkles className="h-3 w-3" />
              {t("kicker")}
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-2 text-muted-foreground text-base max-w-xl">
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onStartBlank}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-accent transition-colors text-sm font-medium shrink-0"
          >
            <Plus className="h-4 w-4" />
            {t("startBlank")}
          </button>
        </div>

        {/* UX-DEF-004: Generate-from-prompt panel. Sits between the
            header lockup and the curated template grid so it reads as
            a third creation path, peer to "pick a template" and
            "start blank". Hidden if no onUseGenerated handler is
            provided (storybook / disabled workspaces). */}
        {canGenerate ? (
          <div className="mb-8 rounded-2xl border border-border bg-gradient-to-br from-purple-500/5 via-background to-blue-500/5 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">
                {t("generate.heading")}
              </h2>
              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {t("generate.badge")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3 max-w-2xl">
              {t("generate.subtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder={t("generate.placeholder")}
                rows={2}
                aria-label={t("generate.describeAriaLabel")}
                disabled={isGenerating}
                className={cn(
                  "flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50",
                  "disabled:opacity-60",
                )}
              />
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || prompt.trim().length < 8}
                className={cn(
                  "shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  "bg-purple-600 text-white hover:bg-purple-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
                    Drafting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden />
                    Generate workflow
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}

        {/* Search + module filter row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            wrapperClassName="flex-1"
          />
          <div className="flex items-center gap-1 p-1 bg-muted/50 border border-border rounded-xl overflow-x-auto">
            <FilterPill
              active={moduleFilter === "all"}
              onClick={() => setModuleFilter("all")}
              label={t("allModules")}
            />
            {modulesPresent.map((m) => {
              const Icon = moduleIcons[m];
              return (
                <FilterPill
                  key={m}
                  active={moduleFilter === m}
                  onClick={() => setModuleFilter(m)}
                  label={moduleLabels[m]}
                  icon={<Icon className="h-3.5 w-3.5" />}
                />
              );
            })}
          </div>
        </div>

        {/* Template grid */}
        {filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl py-16 px-6 text-center">
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">{t("noResults")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("noResultsHint")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                onUse={() => onUseTemplate(tmpl)}
              />
            ))}
            {/* Blank-start card — last in the grid, dashed border, no module
                accent. Reads as the "escape hatch" rather than competing
                with the curated templates. */}
            <button
              type="button"
              onClick={onStartBlank}
              className="group relative text-left rounded-2xl border-2 border-dashed border-border bg-background hover:border-foreground/40 hover:bg-accent/30 transition-colors p-5 flex flex-col gap-4 min-h-[200px]"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <Wand2 className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">
                    {t("blankCard.title")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("blankCard.subtitle")}
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground flex-1">
                {t("blankCard.description")}
              </p>
              <div className="flex items-center gap-1.5 text-sm text-foreground font-medium">
                {t("blankCard.cta")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplateCard — the per-template grid tile.
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onUse,
}: {
  template: AutomationTemplate;
  onUse: () => void;
}) {
  const Icon = moduleIcons[template.module] ?? Zap;
  const colorTone = moduleColors[template.module];
  const accentHex = moduleAccentHex[template.module];

  // Cap the visible action chips to keep cards predictable. If there are
  // more, surface the count as "+N more".
  const visibleActions = template.actions.slice(0, 3);
  const overflow = template.actions.length - visibleActions.length;

  return (
    <button
      type="button"
      onClick={onUse}
      className="group relative text-left rounded-2xl border border-border bg-card hover:border-foreground/40 transition-colors p-5 flex flex-col gap-4 min-h-[200px]"
      style={
        {
          "--accent": accentHex,
        } as React.CSSProperties
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            colorTone,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground leading-snug">
            {template.name}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {moduleLabels[template.module]}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground flex-1 line-clamp-3">
        {template.description}
      </p>

      {/* The "trace" — a horizontal sequence chip-trigger → chip-action[]
          using the module accent. This is the distinctive moment per the
          audit: every card visualizes the flow it'll build for you. */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border"
          style={{
            color: accentHex,
            borderColor: `${accentHex}66`,
            background: `${accentHex}14`,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accentHex }}
          />
          {template.triggerLabel}
        </span>
        {visibleActions.map((action, i) => (
          <React.Fragment key={`${template.id}-action-${i}`}>
            <span
              aria-hidden
              className="text-muted-foreground/40"
              style={{ letterSpacing: "0.05em" }}
            >
              {"→"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border text-foreground bg-background">
              {action.label}
            </span>
          </React.Fragment>
        ))}
        {overflow > 0 ? (
          <>
            <span
              aria-hidden
              className="text-muted-foreground/40"
              style={{ letterSpacing: "0.05em" }}
            >
              {"→"}
            </span>
            <span className="text-muted-foreground">+{overflow}</span>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
        <span>Use this template</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// FilterPill — the per-module chip filter.
// ---------------------------------------------------------------------------

function FilterPill({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
