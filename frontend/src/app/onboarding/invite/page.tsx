"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Users,
  Mail,
  X,
  Plus,
  UserPlus,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";

export default function InviteTeam() {
  const router = useRouter();
  const { data, updateData, setCurrentStep } = useOnboarding();
  const [email, setEmail] = useState("");
  const [emails, setEmails] = useState<string[]>(data.invitedEmails);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentStep(6);
  }, [setCurrentStep]);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const addEmail = () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    if (emails.includes(trimmedEmail)) {
      setError("This email has already been added");
      return;
    }

    setEmails([...emails, trimmedEmail]);
    setEmail("");
    setError(null);
  };

  const removeEmail = (emailToRemove: string) => {
    setEmails(emails.filter(e => e !== emailToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addEmail();
    }
  };

  const handleContinue = async () => {
    updateData({ invitedEmails: emails });

    // TODO: Actually send invites via API
    // for (const email of emails) {
    //   await workspaceApi.inviteMember(email);
    // }

    router.push("/onboarding/complete");
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 6
                ? "w-8 bg-primary-500"
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
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Invite your team
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Collaboration is better together. Invite your teammates to join
            your workspace.
          </p>
        </div>

        <div className="max-w-xl mx-auto">
          {/* Email input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Email addresses
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="colleague@company.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>
              <button
                onClick={addEmail}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          {/* Email list */}
          {emails.length > 0 && (
            <div className="space-y-2 mb-8">
              <p className="text-sm text-slate-400 mb-3">
                {emails.length} invite{emails.length !== 1 ? "s" : ""} ready to send
              </p>
              {emails.map((inviteEmail, index) => (
                <motion.div
                  key={inviteEmail}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="flex items-center justify-between p-3 bg-slate-800/30 border border-slate-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                      <UserPlus className="w-4 h-4 text-slate-400" />
                    </div>
                    <span className="text-slate-300">{inviteEmail}</span>
                  </div>
                  <button
                    onClick={() => removeEmail(inviteEmail)}
                    className="p-1 text-slate-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {emails.length === 0 && (
            <div className="text-center py-8 bg-slate-800/20 border border-slate-700/30 rounded-xl mb-8">
              <UserPlus className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 mb-1">No invites added yet</p>
              <p className="text-sm text-slate-500">
                You can always invite teammates later from Settings
              </p>
            </div>
          )}

          {/* Tip */}
          <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-4 mb-8">
            <p className="text-sm text-slate-400">
              <strong className="text-slate-300">Tip:</strong> You can paste multiple
              email addresses separated by commas or spaces.
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800 max-w-xl mx-auto">
          <button
            onClick={() => {
              if (data.connections.google) {
                router.push("/onboarding/gmail-settings");
              } else if (data.connections.github) {
                router.push("/onboarding/repos");
              } else {
                router.push("/onboarding/connect");
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/onboarding/complete")}
              className="text-slate-400 hover:text-white transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25"
            >
              {emails.length > 0 ? `Send ${emails.length} Invite${emails.length !== 1 ? "s" : ""}` : "Continue"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
