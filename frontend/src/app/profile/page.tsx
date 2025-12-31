"use client";

import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  User,
  Mail,
  Github,
  Calendar,
  Code,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

export default function ProfilePage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const skillFingerprint = user?.skill_fingerprint;
  const workPatterns = user?.work_patterns;

  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">My Profile</h1>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="md:col-span-1">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="flex flex-col items-center text-center">
                {user?.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt={user.name || "User"}
                    width={96}
                    height={96}
                    className="rounded-full mb-4"
                  />
                ) : (
                  <div className="w-24 h-24 bg-slate-700 rounded-full flex items-center justify-center mb-4">
                    <User className="h-12 w-12 text-slate-400" />
                  </div>
                )}
                <h2 className="text-xl font-semibold text-white mb-1">
                  {user?.name || "Developer"}
                </h2>
                <p className="text-slate-400 text-sm mb-4">{user?.email}</p>

                {user?.github_connection && (
                  <a
                    href={`https://github.com/${user.github_connection.github_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary-400 hover:text-primary-300 transition text-sm"
                  >
                    <Github className="h-4 w-4" />
                    @{user.github_connection.github_username}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="md:col-span-2 space-y-6">
            {/* Work Patterns */}
            {workPatterns && (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary-500" />
                  Work Patterns
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-slate-400 text-sm mb-1">Peak Productivity Hours</p>
                    <p className="text-white font-medium">
                      {workPatterns.peak_productivity_hours?.length > 0
                        ? workPatterns.peak_productivity_hours.map(h => `${h}:00`).join(", ")
                        : "Not analyzed yet"}
                    </p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-slate-400 text-sm mb-1">Collaboration Style</p>
                    <p className="text-white font-medium capitalize">
                      {workPatterns.collaboration_style || "Not analyzed yet"}
                    </p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-slate-400 text-sm mb-1">Avg PR Size</p>
                    <p className="text-white font-medium">
                      {workPatterns.average_pr_size?.toFixed(0) || "0"} lines
                    </p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-slate-400 text-sm mb-1">Review Turnaround</p>
                    <p className="text-white font-medium">
                      {workPatterns.average_review_turnaround_hours
                        ? `${workPatterns.average_review_turnaround_hours.toFixed(1)}h`
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Skill Fingerprint */}
            {skillFingerprint && skillFingerprint.languages?.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Code className="h-5 w-5 text-primary-500" />
                  Skill Fingerprint
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Languages</p>
                    <div className="flex flex-wrap gap-2">
                      {skillFingerprint.languages.map((lang) => (
                        <span
                          key={lang.name}
                          className="px-3 py-1 bg-primary-900/50 text-primary-400 rounded-full text-sm"
                        >
                          {lang.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  {skillFingerprint.frameworks?.length > 0 && (
                    <div>
                      <p className="text-slate-400 text-sm mb-2">Frameworks</p>
                      <div className="flex flex-wrap gap-2">
                        {skillFingerprint.frameworks.map((fw) => (
                          <span
                            key={fw.name}
                            className="px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-sm"
                          >
                            {fw.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Links */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Links</h3>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition text-slate-300 hover:text-white"
                >
                  <TrendingUp className="h-4 w-4" />
                  View Dashboard
                </Link>
                <Link
                  href="/learning"
                  className="flex items-center gap-2 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition text-slate-300 hover:text-white"
                >
                  <Calendar className="h-4 w-4" />
                  Learning Path
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition text-slate-300 hover:text-white"
                >
                  <User className="h-4 w-4" />
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
