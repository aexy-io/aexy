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
import { LedgerPage } from "@/components/landing/LedgerPage";


const features = [
  {
    icon: Calendar,
    title: "Calendar Sync",
    description: "Connect Google Calendar or Microsoft Outlook. Automatic availability detection and conflict prevention.",
  },
  {
    icon: Users,
    title: "Team Booking",
    description: "Book with entire teams or rotating hosts. Round-robin, collective, and all-hands meeting modes.",
  },
  {
    icon: UserCheck,
    title: "RSVP System",
    description: "Team members receive invitations and can accept or decline. Track response status in real-time.",
  },
  {
    icon: Link2,
    title: "Custom Booking Links",
    description: "Shareable links for workspaces, event types, and specific teams. Clean URLs that work anywhere.",
  },
];

const eventTypes = [
  { name: "30-Minute Meeting", duration: "30 min" },
  { name: "Team Consultation", duration: "60 min" },
  { name: "Quick Sync", duration: "15 min" },
];

export default function BookingProductPage() {

  return (
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <CalendarCheck className="h-4 w-4" />
                <span>Booking</span>
              </div>

              <h1 className="mb-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Scheduling{" "}
                <span className="text-ledger-green">for teams</span>
              </h1>

              <p className="mb-8 text-xl leading-relaxed text-ledger-ink/65">
                Calendar scheduling that works with your team. Book meetings with
                multiple attendees, sync with Google and Microsoft calendars, and
                share booking links anywhere.
              </p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
                >
                  Start Booking Free
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/pricing"
                  className="group inline-flex items-center justify-center gap-2 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-medium text-ledger-ink transition hover:border-ledger-ink/50"
                >
                  See pricing
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-ledger-ink/55">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Google & Microsoft sync
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-ledger-green" />
                  Team RSVP
                </span>
              </div>
            </div>

            {/* Visual - Booking Preview.

                DARK PANE: a genuine product mockup — the event-type list as the
                app renders it — so it keeps the plate treatment used for product
                UI on the paper page (see OsConsolePreview): ledger-pane ground,
                white-opacity type, ledger-mint as the only accent. The white/*
                utilities below are scoped to this pane on purpose. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-display font-medium">Event Types</h3>
                <button className="flex items-center gap-1 rounded-[2px] border border-white/12 px-3 py-1 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">
                  <Clock className="h-3 w-3" />
                  New Event
                </button>
              </div>

              {/* Event Type List */}
              <div className="mb-6 space-y-3">
                {eventTypes.map((event, idx) => (
                  <div key={idx} className="flex cursor-pointer items-center gap-4 rounded-[2px] border border-white/12 p-4 transition-colors hover:bg-white/[0.03]">
                    <Calendar className="h-5 w-5 text-ledger-mint" />
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-white/85">{event.name}</p>
                      <p className="font-brand-mono text-[11px] text-white/50">{event.duration}</p>
                    </div>
                    <div className="rounded-[2px] border border-white/12 px-2 py-1 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-ledger-mint">
                      Active
                    </div>
                  </div>
                ))}
              </div>

              {/* Team Calendar Preview */}
              <div className="rounded-[2px] border border-white/12 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-ledger-mint" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Team Availability</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, idx) => (
                    <div key={day} className="text-center">
                      <p className="mb-1 font-brand-mono text-[11px] text-white/50">{day}</p>
                      <div className={`h-8 rounded-[2px] ${idx === 2 ? "bg-ledger-mint/35" : "bg-white/10"}`} />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-center font-brand-mono text-[11px] text-white/50">3 team members available Wednesday</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Scheduling that scales with your team
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-ledger-ink/55">
              Not just another calendar tool. A complete booking system built for engineering teams.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="h-full rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-8 transition hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
              >
                <feature.icon className="mb-6 h-5 w-5 text-ledger-green" />
                <h3 className="mb-3 font-display text-xl font-semibold">{feature.title}</h3>
                <p className="text-ledger-ink/65">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Booking Section */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-10 md:p-12">
            <div className="mb-10 text-center">
              <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Book meetings with entire teams
              </h2>
              <p className="text-ledger-ink/65">
                Three flexible assignment modes for different meeting types.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { icon: Repeat, label: "Round Robin", desc: "Rotates between team members" },
                { icon: Users, label: "Collective", desc: "First available member" },
                { icon: UserCheck, label: "All Hands", desc: "Everyone attends with RSVP" },
              ].map((item, idx) => (
                <div key={idx} className="rounded-[2px] border border-ledger-ink/12 bg-ledger-paper p-6 text-center">
                  <item.icon className="mx-auto mb-3 h-5 w-5 text-ledger-green" />
                  <h3 className="mb-1 font-display font-semibold">{item.label}</h3>
                  <p className="font-brand-mono text-[11px] text-ledger-ink/55">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* RSVP Feature */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Send className="h-3 w-3" />
                RSVP SYSTEM
              </div>
              <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Let your team respond
              </h2>
              <p className="mb-6 text-ledger-ink/65">
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
                  <li key={idx} className="flex items-start gap-3 text-ledger-ink/75">
                    <span className="font-brand-mono leading-6 text-ledger-green">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* DARK PANE: the RSVP tracker as the app renders it — a genuine
                product mockup, so the white/* utilities inside are intentional. */}
            <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
              <div className="mb-4 flex items-center gap-3">
                <CalendarCheck className="h-5 w-5 text-ledger-mint" />
                <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">RSVP Status</span>
              </div>
              <div className="space-y-3">
                {[
                  { name: "Sarah Chen", status: "Confirmed", tone: "text-ledger-mint" },
                  { name: "Mike Johnson", status: "Pending", tone: "text-white/70" },
                  { name: "Alex Rivera", status: "Declined", tone: "text-white/50" },
                ].map((attendee, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-[2px] border border-white/12 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-white/12 font-brand-mono text-[11px] text-white/70">
                        {attendee.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="text-[13px] text-white/85">{attendee.name}</span>
                    </div>
                    <span className={`font-brand-mono text-[10px] uppercase tracking-[0.14em] ${attendee.tone}`}>
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
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div className="order-2 md:order-1">
              {/* DARK PANE: public booking URLs as the app renders them — a
                  genuine product mockup, white/* utilities intentional. */}
              <div className="rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-6 text-[#E6EDE7]">
                <div className="mb-4 flex items-center gap-3">
                  <Globe className="h-5 w-5 text-ledger-mint" />
                  <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Public Booking URLs</span>
                </div>
                <div className="space-y-3">
                  {[
                    { url: "/book/acme-corp", desc: "Workspace landing" },
                    { url: "/book/acme-corp/30-min", desc: "Event type" },
                    { url: "/book/acme-corp/consult/team/eng", desc: "Team booking" },
                  ].map((link, idx) => (
                    <div key={idx} className="rounded-[2px] border border-white/12 p-3">
                      <code className="font-brand-mono text-[13px] text-ledger-mint">{link.url}</code>
                      <p className="mt-1 font-brand-mono text-[11px] text-white/50">{link.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="mb-4 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                <Link2 className="h-3 w-3" />
                SHAREABLE LINKS
              </div>
              <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Clean booking URLs
              </h2>
              <p className="mb-6 text-ledger-ink/65">
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
                  <li key={idx} className="flex items-start gap-3 text-ledger-ink/75">
                    <span className="font-brand-mono leading-6 text-ledger-green">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Start scheduling smarter
          </h2>
          <p className="mb-10 text-xl text-ledger-ink/55">
            Calendar booking that works for your entire team.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-3 rounded-[2px] bg-ledger-green px-8 py-4 text-lg font-semibold text-ledger-paper transition hover:bg-[#095A31]"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="https://github.com/aexy-io/aexy"
              className="group flex items-center justify-center gap-3 rounded-[2px] border border-ledger-ink/25 px-8 py-4 text-lg font-semibold text-ledger-ink transition hover:border-ledger-ink/50"
            >
              <Github className="h-5 w-5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

    </LedgerPage>
  );
}
