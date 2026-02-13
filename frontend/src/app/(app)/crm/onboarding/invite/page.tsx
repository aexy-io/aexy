"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  UserPlus,
  Mail,
  Link2,
  X,
  Copy,
  CheckCircle2,
  Users,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { workspaceApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";

interface TeamMember {
  email: string;
  role: "admin" | "member";
}

export default function InviteTeam() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { email: "", role: "member" },
  ]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const inviteLink = currentWorkspace
    ? `https://aexy.io/invite/${currentWorkspace.id}`
    : "https://aexy.io/invite/...";

  const addMember = () => {
    setTeamMembers([...teamMembers, { email: "", role: "member" }]);
  };

  const removeMember = (index: number) => {
    setTeamMembers(teamMembers.filter((_, i) => i !== index));
  };

  const updateMember = (index: number, field: keyof TeamMember, value: string) => {
    const updated = [...teamMembers];
    updated[index] = { ...updated[index], [field]: value };
    setTeamMembers(updated);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleComplete = async () => {
    // Filter out empty emails
    const validMembers = teamMembers.filter(m => m.email.trim() !== "");
    localStorage.setItem("crm_onboarding_invites", JSON.stringify(validMembers));

    // Send invites if we have a workspace and valid members
    if (currentWorkspace && validMembers.length > 0) {
      setIsSending(true);
      setSentCount(0);

      try {
        for (const member of validMembers) {
          try {
            await workspaceApi.inviteMember(currentWorkspace.id, member.email, member.role);
            setSentCount((prev) => prev + 1);
          } catch {
            // Continue with other emails even if one fails
            console.error(`Failed to invite ${member.email}`);
          }
        }
      } finally {
        setIsSending(false);
      }
    }

    router.push("/crm/onboarding/complete");
  };

  const hasValidEmails = teamMembers.some(m => m.email.trim() !== "");

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator - 6 steps now with connect */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 5
                ? "w-8 bg-purple-500"
                : "w-4 bg-slate-700"
            }`}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">
            Invite your team
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            CRM works better with your team. Invite colleagues to collaborate
            on contacts and deals.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Email invites */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Invite by email</h3>
                <p className="text-sm text-slate-400">Send email invitations</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {teamMembers.map((member, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={member.email}
                    onChange={(e) => updateMember(index, "email", e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
                  />
                  <select
                    value={member.role}
                    onChange={(e) => updateMember(index, "role", e.target.value as "admin" | "member")}
                    className="px-3 py-2.5 rounded-lg bg-slate-900/50 border border-slate-700 text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  {teamMembers.length > 1 && (
                    <button
                      onClick={() => removeMember(index)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addMember}
              className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add another
            </button>
          </div>

          {/* Invite link */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Share invite link</h3>
                <p className="text-sm text-slate-400">Anyone with link can join</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-400 text-sm truncate">
                {inviteLink}
              </div>
              <button
                onClick={copyLink}
                className={`px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  copiedLink
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-slate-700 text-white hover:bg-slate-600"
                }`}
              >
                {copiedLink ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              This link will expire in 7 days. You can manage team access in settings.
            </p>
          </div>
        </div>

        {/* Team preview */}
        <div className="mt-8 p-4 rounded-xl bg-slate-800/20 border border-slate-700/30">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Users className="w-4 h-4" />
            <span>
              {hasValidEmails
                ? `${teamMembers.filter(m => m.email.trim() !== "").length} invitation${teamMembers.filter(m => m.email.trim() !== "").length !== 1 ? "s" : ""} will be sent`
                : "No invitations added yet"}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mt-8 border-t border-slate-800">
          <button
            onClick={() => router.push("/crm/onboarding/connect")}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleComplete}
              className="text-slate-400 hover:text-white transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={handleComplete}
              disabled={isSending}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending {sentCount}/{teamMembers.filter(m => m.email.trim() !== "").length}...
                </>
              ) : hasValidEmails ? (
                <>
                  Send Invites & Finish
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Finish Setup
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
