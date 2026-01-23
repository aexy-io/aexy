"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Users,
  CalendarCheck,
  Globe,
  Link2,
  Timer,
  Repeat,
  UserCheck,
  Send,
  Github,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const features = [
  {
    icon: Calendar,
    title: "Calendar Sync",
    description: "Connect Google Calendar or Microsoft Outlook. Automatic availability detection and conflict prevention.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Users,
    title: "Team Booking",
    description: "Book with entire teams or rotating hosts. Round-robin, collective, and all-hands meeting modes.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: UserCheck,
    title: "RSVP System",
    description: "Team members receive invitations and can accept or decline. Track response status in real-time.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Link2,
    title: "Custom Booking Links",
    description: "Shareable links for workspaces, event types, and specific teams. Clean URLs that work anywhere.",
    color: "from-amber-500 to-orange-500",
  },
];

const eventTypes = [
  { name: "30-Minute Meeting", duration: "30 min", color: "bg-blue-500/20 text-blue-400" },
  { name: "Team Consultation", duration: "60 min", color: "bg-purple-500/20 text-purple-400" },
  { name: "Quick Sync", duration: "15 min", color: "bg-emerald-500/20 text-emerald-400" },
];

export default function BookingProductPage() {
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full text-blue-400 text-sm mb-6">
                <CalendarCheck className="h-4 w-4" />
                <span>Booking</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                Scheduling{" "}
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  for teams
                </span>
              </h1>

              <p className="text-xl text-white/60 mb-8 leading-relaxed">
                Calendar scheduling that works with your team. Book meetings with
                multiple attendees, sync with Google and Microsoft calendars, and
                share booking links anywhere.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href={googleLoginUrl}
                  className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(59,130,246,0.3)]"
                >
                  Start Booking Free
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </a>
                <Link
                  href="/manifesto"
                  className="group inline-flex items-center justify-center gap-2 bg-white/5 text-white px-8 py-4 rounded-full text-lg font-medium border border-white/10 hover:border-white/20 transition-all"
                >
                  Learn More
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-white/40">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Google & Microsoft sync
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Team RSVP
                </span>
              </div>
            </div>

            {/* Visual - Booking Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-medium">Event Types</h3>
                  <button className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    New Event
                  </button>
                </div>

                {/* Event Type List */}
                <div className="space-y-3 mb-6">
                  {eventTypes.map((event, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500/30 to-cyan-500/30 rounded-full flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{event.name}</p>
                        <p className="text-white/40 text-xs">{event.duration}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs ${event.color}`}>
                        Active
                      </div>
                    </div>
                  ))}
                </div>

                {/* Team Calendar Preview */}
                <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-blue-400" />
                    <span className="text-white/70 text-sm">Team Availability</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, idx) => (
                      <div key={day} className="text-center">
                        <p className="text-white/40 text-xs mb-1">{day}</p>
                        <div className={`h-8 rounded ${idx === 2 ? "bg-emerald-500/30" : "bg-white/10"}`} />
                      </div>
                    ))}
                  </div>
                  <p className="text-white/50 text-xs mt-2 text-center">3 team members available Wednesday</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Scheduling that scales with your team
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Not just another calendar tool. A complete booking system built for engineering teams.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <div key={idx} className="group relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} rounded-3xl opacity-0 group-hover:opacity-10 blur-xl transition-all duration-500`} />
                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all h-full">
                  <div className={`p-4 bg-gradient-to-br ${feature.color} rounded-2xl w-fit mb-6`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                  <p className="text-white/60">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Booking Section */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-10 md:p-12 border border-white/10">
              <div className="text-center mb-10">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Book meetings with entire teams
                </h2>
                <p className="text-white/60">
                  Three flexible assignment modes for different meeting types.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { icon: Repeat, label: "Round Robin", desc: "Rotates between team members" },
                  { icon: Users, label: "Collective", desc: "First available member" },
                  { icon: UserCheck, label: "All Hands", desc: "Everyone attends with RSVP" },
                ].map((item, idx) => (
                  <div key={idx} className="text-center p-6 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <item.icon className="h-6 w-6 text-blue-400" />
                    </div>
                    <h3 className="text-white font-medium mb-1">{item.label}</h3>
                    <p className="text-white/40 text-xs">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RSVP Feature */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full text-blue-400 text-xs mb-4">
                <Send className="h-3 w-3" />
                RSVP SYSTEM
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Let your team respond
              </h2>
              <p className="text-white/60 mb-6">
                When meetings are booked with multiple attendees, each team member
                receives an invitation they can accept or decline. No more calendar chaos.
              </p>
              <ul className="space-y-3">
                {[
                  "Personal RSVP links for each attendee",
                  "Accept or decline with one click",
                  "Real-time status tracking",
                  "Email notifications for responses",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-blue-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <CalendarCheck className="h-5 w-5 text-blue-400" />
                <span className="text-white font-medium">RSVP Status</span>
              </div>
              <div className="space-y-3">
                {[
                  { name: "Sarah Chen", status: "Confirmed", color: "bg-emerald-500/20 text-emerald-400" },
                  { name: "Mike Johnson", status: "Pending", color: "bg-amber-500/20 text-amber-400" },
                  { name: "Alex Rivera", status: "Declined", color: "bg-red-500/20 text-red-400" },
                ].map((attendee, idx) => (
                  <div key={idx} className="p-3 bg-white/5 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500/30 to-cyan-500/30 rounded-full flex items-center justify-center text-white text-xs font-medium">
                        {attendee.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="text-white text-sm">{attendee.name}</span>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${attendee.color}`}>
                      {attendee.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Booking Links */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1">
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <Globe className="h-5 w-5 text-blue-400" />
                  <span className="text-white font-medium">Public Booking URLs</span>
                </div>
                <div className="space-y-3">
                  {[
                    { url: "/book/acme-corp", desc: "Workspace landing" },
                    { url: "/book/acme-corp/30-min", desc: "Event type" },
                    { url: "/book/acme-corp/consult/team/eng", desc: "Team booking" },
                  ].map((link, idx) => (
                    <div key={idx} className="p-3 bg-white/5 rounded-lg">
                      <code className="text-blue-400 text-sm">{link.url}</code>
                      <p className="text-white/40 text-xs mt-1">{link.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full text-blue-400 text-xs mb-4">
                <Link2 className="h-3 w-3" />
                SHAREABLE LINKS
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Clean booking URLs
              </h2>
              <p className="text-white/60 mb-6">
                Share links to your workspace, specific event types, or team booking
                pages. External users can book without creating an account.
              </p>
              <ul className="space-y-3">
                {[
                  "Workspace landing with all event types",
                  "Direct links to specific meetings",
                  "Team-specific booking pages",
                  "Custom member selection via URL params",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-blue-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Start scheduling smarter
          </h2>
          <p className="text-xl text-white/50 mb-10">
            Calendar booking that works for your entire team.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={googleLoginUrl}
              className="group inline-flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
            >
              <Github className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
