"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap,
  FormInput,
  FileSpreadsheet,
  Mail,
  Calendar,
  Search,
  ArrowRight,
  Sparkles,
  Users,
  Target,
  MessageSquare,
  Clock,
  AlertTriangle,
  UserPlus,
  Bell,
  TrendingUp,
  ShieldCheck,
  Bot,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  tags: string[];
  href: string;
  isNew?: boolean;
}

const TEMPLATE_CATEGORIES = [
  { id: "all", label: "All Templates", icon: <Sparkles className="h-4 w-4" /> },
  { id: "automation", label: "Automations", icon: <Zap className="h-4 w-4" /> },
  { id: "form", label: "Forms", icon: <FormInput className="h-4 w-4" /> },
  { id: "assessment", label: "Assessments", icon: <FileSpreadsheet className="h-4 w-4" /> },
  { id: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { id: "sprint", label: "Sprint", icon: <Calendar className="h-4 w-4" /> },
];

const TEMPLATES: Template[] = [
  // Automation templates
  {
    id: "auto-standup-reminder",
    name: "Missed Standup Follow-up",
    description: "When a team member misses their standup, automatically create a follow-up task and send a reminder.",
    category: "automation",
    icon: <MessageSquare className="h-5 w-5" />,
    tags: ["tracking", "standup", "reminder"],
    href: "/automations/new?template=missed-standup",
    isNew: true,
  },
  {
    id: "auto-blocker-escalation",
    name: "Blocker Auto-Escalation",
    description: "Escalate blockers that remain unresolved for more than 2 days to the engineering manager.",
    category: "automation",
    icon: <AlertTriangle className="h-5 w-5" />,
    tags: ["tracking", "blocker", "escalation"],
    href: "/automations/new?template=blocker-escalation",
  },
  {
    id: "auto-sprint-velocity",
    name: "Sprint Velocity Alert",
    description: "Notify the team when sprint burndown deviates more than 20% from the ideal trajectory.",
    category: "automation",
    icon: <TrendingUp className="h-5 w-5" />,
    tags: ["sprint", "velocity", "alert"],
    href: "/automations/new?template=velocity-alert",
    isNew: true,
  },
  {
    id: "auto-lead-followup",
    name: "Lead Follow-up Sequence",
    description: "Automatically send follow-up emails to new CRM leads after 1, 3, and 7 days.",
    category: "automation",
    icon: <Users className="h-5 w-5" />,
    tags: ["crm", "lead", "email"],
    href: "/automations/new?template=lead-followup",
  },
  {
    id: "auto-welcome-sequence",
    name: "Welcome Email Sequence",
    description: "Send a series of onboarding emails when a new contact is added to CRM.",
    category: "automation",
    icon: <Mail className="h-5 w-5" />,
    tags: ["crm", "email", "onboarding"],
    href: "/automations/new?template=welcome-sequence",
  },
  {
    id: "auto-compliance-reminder",
    name: "Compliance Due Date Alert",
    description: "Alert team members 7 days before compliance deadlines and escalate overdue items.",
    category: "automation",
    icon: <ShieldCheck className="h-5 w-5" />,
    tags: ["compliance", "reminder", "deadline"],
    href: "/automations/new?template=compliance-alert",
  },
  {
    id: "auto-ticket-ai-triage",
    name: "AI Ticket Triage",
    description: "Use AI to classify and route incoming tickets by priority and department.",
    category: "automation",
    icon: <Bot className="h-5 w-5" />,
    tags: ["tickets", "ai", "triage"],
    href: "/automations/new?template=ai-triage",
    isNew: true,
  },
  {
    id: "auto-deal-stage-alert",
    name: "Deal Stage Notification",
    description: "Notify the sales team when a deal moves to a new pipeline stage.",
    category: "automation",
    icon: <Bell className="h-5 w-5" />,
    tags: ["crm", "deals", "notification"],
    href: "/automations/new?template=deal-stage-alert",
  },

  // Form templates
  {
    id: "form-bug-report",
    name: "Bug Report Form",
    description: "Structured bug report with severity, steps to reproduce, and expected behavior fields.",
    category: "form",
    icon: <AlertTriangle className="h-5 w-5" />,
    tags: ["tickets", "bug", "support"],
    href: "/forms?action=new&template=bug-report",
  },
  {
    id: "form-feature-request",
    name: "Feature Request Form",
    description: "Capture feature requests with use case, priority, and user impact.",
    category: "form",
    icon: <Sparkles className="h-5 w-5" />,
    tags: ["product", "feature", "feedback"],
    href: "/forms?action=new&template=feature-request",
  },
  {
    id: "form-customer-feedback",
    name: "Customer Feedback Survey",
    description: "NPS-style survey with rating, open feedback, and follow-up questions.",
    category: "form",
    icon: <Users className="h-5 w-5" />,
    tags: ["crm", "feedback", "survey"],
    href: "/forms?action=new&template=customer-feedback",
  },
  {
    id: "form-onboarding-checklist",
    name: "Employee Onboarding",
    description: "New hire onboarding checklist with equipment, access, and training tasks.",
    category: "form",
    icon: <UserPlus className="h-5 w-5" />,
    tags: ["hiring", "onboarding", "checklist"],
    href: "/forms?action=new&template=onboarding",
  },

  // Assessment templates
  {
    id: "assess-frontend",
    name: "Frontend Developer Assessment",
    description: "React, TypeScript, and CSS assessment with coding challenges and system design.",
    category: "assessment",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    tags: ["hiring", "frontend", "react"],
    href: "/hiring/assessments?action=new&template=frontend",
  },
  {
    id: "assess-backend",
    name: "Backend Developer Assessment",
    description: "API design, database modeling, and system architecture assessment.",
    category: "assessment",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    tags: ["hiring", "backend", "api"],
    href: "/hiring/assessments?action=new&template=backend",
  },
  {
    id: "assess-fullstack",
    name: "Full-Stack Assessment",
    description: "End-to-end assessment covering frontend, backend, and deployment.",
    category: "assessment",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    tags: ["hiring", "fullstack"],
    href: "/hiring/assessments?action=new&template=fullstack",
  },

  // Email templates
  {
    id: "email-product-launch",
    name: "Product Launch Announcement",
    description: "Announce a new feature or product launch to your audience with highlights and CTA.",
    category: "email",
    icon: <Sparkles className="h-5 w-5" />,
    tags: ["marketing", "launch", "announcement"],
    href: "/email-marketing/templates?action=new&template=product-launch",
  },
  {
    id: "email-newsletter",
    name: "Weekly Newsletter",
    description: "Recurring newsletter template with sections for updates, tips, and highlights.",
    category: "email",
    icon: <Mail className="h-5 w-5" />,
    tags: ["marketing", "newsletter", "weekly"],
    href: "/email-marketing/templates?action=new&template=newsletter",
  },

  // Sprint templates
  {
    id: "sprint-2week",
    name: "2-Week Sprint Setup",
    description: "Pre-configured 2-week sprint with planning, daily standups, and retrospective milestones.",
    category: "sprint",
    icon: <Calendar className="h-5 w-5" />,
    tags: ["sprint", "planning", "agile"],
    href: "/sprints?action=new&template=2week",
  },
  {
    id: "sprint-kanban",
    name: "Kanban Board Setup",
    description: "Continuous flow board with WIP limits and pull-based task management.",
    category: "sprint",
    icon: <Target className="h-5 w-5" />,
    tags: ["kanban", "board", "continuous"],
    href: "/sprints?action=new&template=kanban",
  },
  {
    id: "sprint-bug-bash",
    name: "Bug Bash Sprint",
    description: "Focused 1-week sprint for triaging and fixing accumulated bugs.",
    category: "sprint",
    icon: <AlertTriangle className="h-5 w-5" />,
    tags: ["sprint", "bugs", "quality"],
    href: "/sprints?action=new&template=bug-bash",
  },
];

export default function TemplatesGalleryPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const filteredTemplates = TEMPLATES.filter((t) => {
    const matchCategory = selectedCategory === "all" || t.category === selectedCategory;
    if (!searchQuery.trim()) return matchCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q));
    return matchCategory && matchSearch;
  });

  const categoryColors: Record<string, string> = {
    automation: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    form: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    assessment: "bg-green-500/10 text-green-400 border-green-500/20",
    email: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    sprint: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Templates</h1>
        <p className="text-muted-foreground mt-1">
          Get started quickly with pre-built templates for automations, forms, assessments, and more.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search templates..."
          wrapperClassName="flex-1"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-muted-foreground hover:text-foreground hover:bg-accent/80"
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground mb-4">
        {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
        {selectedCategory !== "all" && ` in ${TEMPLATE_CATEGORIES.find((c) => c.id === selectedCategory)?.label}`}
      </p>

      {/* Template Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">No templates found</h3>
          <p className="text-muted-foreground text-sm">
            Try a different search term or category.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <Link
              key={template.id}
              href={template.href}
              className="group bg-background/50 border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-lg border ${categoryColors[template.category] || "bg-accent text-muted-foreground border-border"}`}>
                  {template.icon}
                </div>
                {template.isNew && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-primary/20 text-primary rounded-full uppercase">
                    New
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                {template.name}
              </h3>
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                {template.description}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {template.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 text-[10px] text-muted-foreground bg-accent rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
