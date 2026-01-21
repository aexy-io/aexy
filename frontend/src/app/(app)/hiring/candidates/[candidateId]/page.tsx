"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect, useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Clock,
  MapPin,
  Briefcase,
  GraduationCap,
  FileText,
  ClipboardCheck,
  MessageSquare,
  Send,
  Star,
  ChevronRight,
  ExternalLink,
  Download,
  Edit,
  Trash2,
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Building2,
  Tag,
  Activity,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CandidateStage = "applied" | "screening" | "assessment" | "interview" | "offer" | "hired" | "rejected";

interface Activity {
  id: string;
  type: "stage_change" | "note" | "email" | "assessment" | "interview";
  title: string;
  description: string;
  timestamp: string;
  user: string;
}

const STAGE_CONFIG: Record<CandidateStage, { label: string; color: string; bgColor: string }> = {
  applied: { label: "Applied", color: "text-blue-400", bgColor: "bg-blue-500" },
  screening: { label: "Screening", color: "text-cyan-400", bgColor: "bg-cyan-500" },
  assessment: { label: "Assessment", color: "text-primary-400", bgColor: "bg-primary-500" },
  interview: { label: "Interview", color: "text-purple-400", bgColor: "bg-purple-500" },
  offer: { label: "Offer", color: "text-orange-400", bgColor: "bg-orange-500" },
  hired: { label: "Hired", color: "text-green-400", bgColor: "bg-green-500" },
  rejected: { label: "Rejected", color: "text-red-400", bgColor: "bg-red-500" },
};

const STAGES_ORDER: CandidateStage[] = ["applied", "screening", "assessment", "interview", "offer", "hired"];

// Mock candidate data
const MOCK_CANDIDATE = {
  id: "1",
  name: "Sarah Chen",
  email: "sarah.chen@example.com",
  phone: "+1 (555) 123-4567",
  location: "San Francisco, CA",
  role: "Senior Frontend Engineer",
  stage: "interview" as CandidateStage,
  source: "LinkedIn",
  score: 85,
  appliedAt: "2024-01-10",
  tags: ["React", "TypeScript", "Next.js", "GraphQL"],
  experience: "8 years",
  education: "MS Computer Science, Stanford University",
  currentCompany: "TechCorp Inc.",
  currentRole: "Frontend Lead",
  linkedIn: "https://linkedin.com/in/sarahchen",
  resumeUrl: "/resume.pdf",
  notes: "Strong technical background. Great culture fit. Impressed with system design knowledge.",
};

const MOCK_ACTIVITIES: Activity[] = [
  { id: "1", type: "interview", title: "Technical Interview Completed", description: "Passed technical round with John Doe. Score: 4.5/5", timestamp: "2024-01-18 14:30", user: "John Doe" },
  { id: "2", type: "stage_change", title: "Moved to Interview", description: "Candidate advanced to interview stage after assessment", timestamp: "2024-01-16 09:00", user: "System" },
  { id: "3", type: "assessment", title: "Assessment Completed", description: "Technical assessment score: 85%", timestamp: "2024-01-15 16:45", user: "Sarah Chen" },
  { id: "4", type: "email", title: "Assessment Invitation Sent", description: "Sent technical assessment invitation", timestamp: "2024-01-12 10:00", user: "Jane Smith" },
  { id: "5", type: "stage_change", title: "Moved to Assessment", description: "Candidate passed phone screening", timestamp: "2024-01-12 09:30", user: "Jane Smith" },
  { id: "6", type: "note", title: "Note Added", description: "Great communication skills during screening call", timestamp: "2024-01-11 15:00", user: "Jane Smith" },
  { id: "7", type: "stage_change", title: "Moved to Screening", description: "Resume reviewed, moving to screening", timestamp: "2024-01-10 14:00", user: "System" },
  { id: "8", type: "stage_change", title: "Application Received", description: "Candidate applied via LinkedIn", timestamp: "2024-01-10 11:00", user: "System" },
];

function StageTimeline({ currentStage }: { currentStage: CandidateStage }) {
  const currentIndex = STAGES_ORDER.indexOf(currentStage);

  return (
    <div className="flex items-center gap-2">
      {STAGES_ORDER.map((stage, index) => {
        const config = STAGE_CONFIG[stage];
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={stage} className="flex items-center">
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition",
                isCompleted ? cn(config.bgColor, "text-white") :
                isCurrent ? cn(config.bgColor, "text-white ring-2 ring-offset-2 ring-offset-slate-900", `ring-${config.bgColor.replace("bg-", "")}`) :
                "bg-slate-700 text-slate-400"
              )}
            >
              {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </div>
            {index < STAGES_ORDER.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 mx-1",
                  isCompleted ? config.bgColor : "bg-slate-700"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const getIcon = () => {
    switch (activity.type) {
      case "stage_change": return <ChevronRight className="h-4 w-4 text-primary-400" />;
      case "note": return <MessageSquare className="h-4 w-4 text-yellow-400" />;
      case "email": return <Mail className="h-4 w-4 text-blue-400" />;
      case "assessment": return <ClipboardCheck className="h-4 w-4 text-green-400" />;
      case "interview": return <User className="h-4 w-4 text-purple-400" />;
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center">
          {getIcon()}
        </div>
        <div className="w-0.5 flex-1 bg-slate-800 mt-2" />
      </div>
      <div className="flex-1 pb-6">
        <p className="text-sm font-medium text-white">{activity.title}</p>
        <p className="text-sm text-slate-400 mt-0.5">{activity.description}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          <span>{activity.timestamp}</span>
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {activity.user}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CandidateDetailPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { hasWorkspaces, workspacesLoading } = useWorkspace();
  const params = useParams();
  const candidateId = params.candidateId as string;

  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "assessments" | "notes">("overview");
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  // In real app, fetch candidate by ID
  const candidate = MOCK_CANDIDATE;
  const activities = MOCK_ACTIVITIES;

  if (isLoading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading candidate...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces) {
    redirect("/hiring/candidates");
  }

  const stageConfig = STAGE_CONFIG[candidate.stage];

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Back Button */}
        <Link
          href="/hiring/candidates"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pipeline
        </Link>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center text-white text-xl font-bold">
                    {candidate.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">{candidate.name}</h1>
                    <p className="text-slate-400">{candidate.role}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn("text-xs px-2 py-1 rounded", stageConfig.bgColor + "/20", stageConfig.color)}>
                        {stageConfig.label}
                      </span>
                      {candidate.score && (
                        <span className={cn(
                          "text-xs px-2 py-1 rounded flex items-center gap-1",
                          candidate.score >= 80 ? "bg-green-500/20 text-green-400" :
                          candidate.score >= 60 ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-red-500/20 text-red-400"
                        )}>
                          <Star className="h-3 w-3" />
                          {candidate.score}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
                    <Edit className="h-5 w-5" />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Stage Timeline */}
              <div className="mb-6">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Pipeline Progress</p>
                <StageTimeline currentStage={candidate.stage} />
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <button className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                  <Send className="h-4 w-4" />
                  Send Assessment
                </button>
                <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                  <Calendar className="h-4 w-4" />
                  Schedule Interview
                </button>
                <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                  <Mail className="h-4 w-4" />
                  Send Email
                </button>
                <button className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                  <CheckCircle2 className="h-4 w-4" />
                  Move Forward
                </button>
                <button className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition">
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-800">
              <div className="flex gap-4">
                {[
                  { id: "overview", label: "Overview" },
                  { id: "activity", label: "Activity" },
                  { id: "assessments", label: "Assessments" },
                  { id: "notes", label: "Notes" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={cn(
                      "px-4 py-3 text-sm font-medium border-b-2 transition",
                      activeTab === tab.id
                        ? "border-primary-500 text-primary-400"
                        : "border-transparent text-slate-400 hover:text-white"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Candidate Information</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Briefcase className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500">Current Position</p>
                        <p className="text-sm text-white">{candidate.currentRole} at {candidate.currentCompany}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500">Experience</p>
                        <p className="text-sm text-white">{candidate.experience}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <GraduationCap className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500">Education</p>
                        <p className="text-sm text-white">{candidate.education}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500">Location</p>
                        <p className="text-sm text-white">{candidate.location}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Skills</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-1 bg-slate-800 text-slate-300 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Notes</p>
                      <p className="text-sm text-slate-300">{candidate.notes}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "activity" && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">Activity Timeline</h3>
                  <button
                    onClick={() => setShowAddNote(!showAddNote)}
                    className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Add Note
                  </button>
                </div>

                {showAddNote && (
                  <div className="mb-6 p-4 bg-slate-800/50 rounded-lg">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note about this candidate..."
                      rows={3}
                      className="w-full bg-slate-800 text-white rounded-lg px-4 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none resize-none mb-3"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setShowAddNote(false);
                          setNoteText("");
                        }}
                        className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition"
                      >
                        Cancel
                      </button>
                      <button className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition">
                        Add Note
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-0">
                  {activities.map((activity, index) => (
                    <ActivityItem key={activity.id} activity={activity} />
                  ))}
                </div>
              </div>
            )}

            {activeTab === "assessments" && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Assessment Results</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <ClipboardCheck className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">Frontend Technical Assessment</p>
                          <p className="text-xs text-slate-400">Completed Jan 15, 2024</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-400">85%</p>
                        <p className="text-xs text-slate-400">Score</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 pt-3 border-t border-slate-700">
                      <div>
                        <p className="text-xs text-slate-500">React</p>
                        <p className="text-sm font-medium text-white">90%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">TypeScript</p>
                        <p className="text-sm font-medium text-white">85%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">System Design</p>
                        <p className="text-sm font-medium text-white">80%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Problem Solving</p>
                        <p className="text-sm font-medium text-white">85%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notes" && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Notes</h3>
                <div className="space-y-4">
                  {activities.filter((a) => a.type === "note").map((note) => (
                    <div key={note.id} className="p-4 bg-slate-800/50 rounded-lg">
                      <p className="text-sm text-slate-300">{note.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                        <span>{note.timestamp}</span>
                        <span>by {note.user}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Info */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Contact Information</h3>
              <div className="space-y-3">
                <a href={`mailto:${candidate.email}`} className="flex items-center gap-3 text-sm text-slate-400 hover:text-primary-400 transition">
                  <Mail className="h-4 w-4" />
                  {candidate.email}
                </a>
                <a href={`tel:${candidate.phone}`} className="flex items-center gap-3 text-sm text-slate-400 hover:text-primary-400 transition">
                  <Phone className="h-4 w-4" />
                  {candidate.phone}
                </a>
                {candidate.linkedIn && (
                  <a href={candidate.linkedIn} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-slate-400 hover:text-primary-400 transition">
                    <ExternalLink className="h-4 w-4" />
                    LinkedIn Profile
                  </a>
                )}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Documents</h3>
              <div className="space-y-2">
                <button className="w-full flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-white">Resume.pdf</span>
                  </div>
                  <Download className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Application Details */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Application Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Applied</span>
                  <span className="text-white">{candidate.appliedAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Source</span>
                  <span className="text-white">{candidate.source}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Role</span>
                  <span className="text-white">{candidate.role}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
    </main>
  );
}
