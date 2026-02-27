"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ArrowRight,
  GitBranch,
  Users,
  BarChart3,
  Settings,
  Sparkles,
  Rocket,
  Bot,
  Briefcase,
  BookOpen,
  GraduationCap,
  Target,
  Mail,
  FileText,
  ClipboardList,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";
import { repositoriesApi, appAccessApi, AppAccessConfig } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import confetti from "canvas-confetti";
import type { LucideIcon } from "lucide-react";

// Map onboarding use cases → which apps to enable
const useCaseToApps: Record<string, Record<string, AppAccessConfig>> = {
  engineering: {
    dashboard: { enabled: true },
    tracking: { enabled: true, modules: { standups: true, blockers: true, time: true } },
    sprints: { enabled: true, modules: { board: true, epics: true, tasks: true, backlog: true } },
    tickets: { enabled: true },
    oncall: { enabled: true },
    uptime: { enabled: true, modules: { monitors: true, incidents: true, history: true } },
    insights: { enabled: true, modules: { team_overview: true, leaderboard: true, developer_drilldown: true } },
  },
  gtm: {
    dashboard: { enabled: true },
    crm: { enabled: true, modules: { overview: true, inbox: true, agents: true, activities: true, automations: true, calendar: true } },
    email_marketing: { enabled: true, modules: { campaigns: true, templates: true, settings: true } },
    booking: { enabled: true, modules: { event_types: true, availability: true, calendars: true } },
  },
  sales: {
    dashboard: { enabled: true },
    crm: { enabled: true, modules: { overview: true, inbox: true, agents: true, activities: true, automations: true, calendar: true } },
    email_marketing: { enabled: true, modules: { campaigns: true, templates: true, settings: true } },
    booking: { enabled: true, modules: { event_types: true, availability: true, calendars: true } },
    tickets: { enabled: true },
  },
  ai: {
    dashboard: { enabled: true },
    agents: { enabled: true },
    automations: { enabled: true },
  },
  people: {
    dashboard: { enabled: true },
    reviews: { enabled: true, modules: { cycles: true, goals: true, peer_requests: true, manage: true } },
    hiring: { enabled: true, modules: { dashboard: true, candidates: true, assessments: true, questions: true, templates: true, analytics: true } },
    learning: { enabled: true },
    compliance: { enabled: true, modules: { reminders: true, document_center: true, training: true, certifications: true } },
  },
  knowledge: {
    dashboard: { enabled: true },
    docs: { enabled: true },
    tables: { enabled: true },
    forms: { enabled: true },
  },
};

// All app IDs that can be controlled
const ALL_APP_IDS = [
  "dashboard", "tracking", "sprints", "tickets", "reviews", "hiring",
  "learning", "crm", "email_marketing", "docs", "forms", "oncall",
  "booking", "uptime", "automations", "agents", "tables", "insights", "compliance",
];

function buildAppConfigFromUseCases(useCases: string[]): Record<string, AppAccessConfig> {
  const config: Record<string, AppAccessConfig> = {};

  // Start with all apps disabled
  for (const appId of ALL_APP_IDS) {
    config[appId] = { enabled: false };
  }

  // Enable apps based on selected use cases (merge)
  for (const uc of useCases) {
    const ucApps = useCaseToApps[uc];
    if (!ucApps) continue;
    for (const [appId, appConfig] of Object.entries(ucApps)) {
      if (appConfig.enabled) {
        config[appId] = {
          enabled: true,
          modules: { ...(config[appId]?.modules || {}), ...(appConfig.modules || {}) },
        };
      }
    }
  }

  // Dashboard is always enabled
  config.dashboard = { enabled: true };

  return config;
}

const useCaseLabelMap: Record<string, string> = {
  engineering: "Engineering",
  gtm: "GTM & Growth",
  sales: "CRM & Sales",
  ai: "AI & Agents",
  people: "People & HR",
  knowledge: "Knowledge & Data",
};

interface QuickLink {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  color: string;
}

const linksByUseCase: Record<string, QuickLink[]> = {
  engineering: [
    {
      icon: GitBranch,
      title: "Create your first sprint",
      description: "Set up a sprint board and plan your work",
      href: "/sprints",
      color: "from-green-500 to-emerald-600",
    },
    {
      icon: BarChart3,
      title: "View developer insights",
      description: "See commit and PR analytics for your team",
      href: "/insights",
      color: "from-green-500 to-emerald-600",
    },
  ],
  gtm: [
    {
      icon: Target,
      title: "Set up lead scoring",
      description: "Configure scoring rules for your leads",
      href: "/gtm/scoring",
      color: "from-orange-500 to-amber-600",
    },
    {
      icon: Rocket,
      title: "Track visitors",
      description: "See who is visiting your site",
      href: "/gtm/visitors",
      color: "from-orange-500 to-amber-600",
    },
  ],
  sales: [
    {
      icon: Briefcase,
      title: "Go to CRM",
      description: "Start managing contacts and deals",
      href: "/crm",
      color: "from-blue-500 to-blue-600",
    },
    {
      icon: Mail,
      title: "Create email campaign",
      description: "Build and send your first campaign",
      href: "/email-marketing/campaigns",
      color: "from-blue-500 to-blue-600",
    },
  ],
  ai: [
    {
      icon: Bot,
      title: "Create an AI agent",
      description: "Set up an email or sales agent",
      href: "/settings/agents",
      color: "from-cyan-500 to-teal-600",
    },
    {
      icon: Sparkles,
      title: "Build an automation",
      description: "Automate repetitive workflows",
      href: "/automations/new",
      color: "from-cyan-500 to-teal-600",
    },
  ],
  people: [
    {
      icon: GraduationCap,
      title: "Start a review cycle",
      description: "Run performance reviews for your team",
      href: "/reviews/cycles",
      color: "from-rose-500 to-pink-600",
    },
    {
      icon: Users,
      title: "Post a job",
      description: "Create a job listing and start hiring",
      href: "/hiring",
      color: "from-rose-500 to-pink-600",
    },
  ],
  knowledge: [
    {
      icon: FileText,
      title: "Create a doc",
      description: "Start writing a document or wiki page",
      href: "/docs",
      color: "from-purple-500 to-violet-600",
    },
    {
      icon: ClipboardList,
      title: "Build a form",
      description: "Create a form to collect data",
      href: "/forms",
      color: "from-purple-500 to-violet-600",
    },
  ],
};

const alwaysShowLinks: QuickLink[] = [
  {
    icon: BarChart3,
    title: "View Dashboard",
    description: "See your workspace overview",
    href: "/dashboard",
    color: "from-primary-500 to-primary-600",
  },
  {
    icon: Settings,
    title: "Settings",
    description: "Configure integrations and preferences",
    href: "/settings",
    color: "from-slate-500 to-slate-600",
  },
];

export default function OnboardingComplete() {
  const router = useRouter();
  const { data, setCurrentStep, resetOnboarding } = useOnboarding();
  const { user } = useAuth();

  useEffect(() => {
    setCurrentStep(7);

    // Mark onboarding as complete and apply app access
    const markComplete = async () => {
      try {
        await repositoriesApi.completeOnboarding();
        localStorage.setItem("aexy_onboarding_complete", "true");

        // Apply app access based on selected use cases
        const workspaceId = data.workspace.id || localStorage.getItem("current_workspace_id");
        const developerId = user?.id;
        if (workspaceId && developerId && data.useCases.length > 0) {
          const appConfig = buildAppConfigFromUseCases(data.useCases);
          await appAccessApi.updateMemberAccess(workspaceId, developerId, {
            app_config: appConfig,
          });
        }
      } catch (err) {
        console.error("Failed to mark onboarding as complete:", err);
      }
    };
    markComplete();

    // Trigger confetti
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ["#8b5cf6", "#6366f1", "#3b82f6"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ["#8b5cf6", "#6366f1", "#3b82f6"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCurrentStep]);

  const getQuickLinks = (): QuickLink[] => {
    const links: QuickLink[] = [];
    const seen = new Set<string>();

    // Add use-case-specific links (up to 2 per use case, max 6 total)
    for (const uc of data.useCases) {
      const ucLinks = linksByUseCase[uc] || [];
      for (const link of ucLinks) {
        if (!seen.has(link.href) && links.length < 6) {
          seen.add(link.href);
          links.push(link);
        }
      }
    }

    // Add repo link if GitHub is connected
    if (data.connections.github && !seen.has("/repositories")) {
      links.unshift({
        icon: GitBranch,
        title: "View Repositories",
        description: "See your connected repos and activity",
        href: "/repositories",
        color: "from-green-500 to-emerald-600",
      });
    }

    // Always add dashboard and settings at the end
    for (const link of alwaysShowLinks) {
      if (!seen.has(link.href)) {
        seen.add(link.href);
        links.push(link);
      }
    }

    return links.slice(0, 8);
  };

  const handleGoToDashboard = () => {
    resetOnboarding();
    router.push("/dashboard");
  };

  const quickLinks = getQuickLinks();

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator - all complete */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className="h-1.5 w-8 rounded-full bg-primary-500 transition-all"
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle2 className="w-10 h-10 text-white" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            <span>Setup Complete</span>
          </div>

          <h1 className="text-4xl font-bold text-foreground mb-4">
            You&apos;re all set!
          </h1>

          <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
            Your workspace is ready. Here are some quick ways to get started
            with Aexy.
          </p>
        </motion.div>

        {/* Quick links grid */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto">
          {quickLinks.map((link, index) => (
            <motion.button
              key={link.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + index * 0.1 }}
              onClick={() => {
                router.push(link.href);
              }}
              className="flex items-start gap-4 p-5 rounded-xl bg-muted/30 border border-border/50 hover:border-border transition-all text-left group"
            >
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${link.color} flex items-center justify-center flex-shrink-0`}>
                <link.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {link.title}
                </h3>
                <p className="text-sm text-muted-foreground">{link.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors mt-1" />
            </motion.button>
          ))}
        </div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="bg-muted/20 border border-border/30 rounded-xl p-6 mb-10 max-w-2xl mx-auto"
        >
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Setup Summary
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            {data.useCases.map((uc) => (
              <span
                key={uc}
                className="px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400 text-sm"
              >
                {useCaseLabelMap[uc] || uc}
              </span>
            ))}
            {Object.entries(data.connections)
              .filter(([, connected]) => connected)
              .map(([name]) => (
                <span
                  key={name}
                  className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm"
                >
                  {name.charAt(0).toUpperCase() + name.slice(1)} Connected
                </span>
              ))}
            {data.githubRepos.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-muted-foreground/10 border border-muted-foreground/20 text-muted-foreground text-sm">
                {data.githubRepos.length} Repos Selected
              </span>
            )}
            {data.invitedEmails.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
                {data.invitedEmails.length} Invites Sent
              </span>
            )}
          </div>
        </motion.div>

        {/* Main CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.7 }}
          onClick={handleGoToDashboard}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium text-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
        >
          Go to Dashboard
          <ArrowRight className="w-5 h-5" />
        </motion.button>
      </motion.div>
    </div>
  );
}
