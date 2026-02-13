"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  GitBranch,
  ArrowRight,
  ChevronDown,
  Target,
  Calendar,
  Ticket,
  FormInput,
  FileText,
  ClipboardCheck,
  GraduationCap,
  UserPlus,
  Building2,
  Users,
  Code2,
  Briefcase,
  Heart,
  Mail,
  Bot,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { SiGithub } from "@icons-pack/react-simple-icons";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const productLinks = [
  { href: "/products/tracking", label: "Activity Tracking", icon: Target, desc: "Real-time team visibility", color: "from-emerald-500 to-teal-500" },
  { href: "/products/planning", label: "Sprint Planning", icon: Calendar, desc: "AI-powered capacity planning", color: "from-green-500 to-emerald-500" },
  { href: "/products/tickets", label: "Ticketing", icon: Ticket, desc: "Keyboard-first issue tracking", color: "from-pink-500 to-rose-500" },
  { href: "/products/forms", label: "Forms", icon: FormInput, desc: "Drag-and-drop form builder", color: "from-violet-500 to-purple-500" },
  { href: "/products/docs", label: "Documentation", icon: FileText, desc: "Connected team knowledge", color: "from-indigo-500 to-blue-500" },
  { href: "/products/reviews", label: "Performance Reviews", icon: ClipboardCheck, desc: "360° feedback & SMART goals", color: "from-orange-500 to-amber-500" },
  { href: "/products/learning", label: "Learning & Dev", icon: GraduationCap, desc: "Personalized skill growth", color: "from-rose-500 to-pink-500" },
  { href: "/products/hiring", label: "Technical Hiring", icon: UserPlus, desc: "AI-powered assessments", color: "from-cyan-500 to-blue-500" },
  { href: "/products/crm", label: "CRM", icon: Building2, desc: "Relationship management", color: "from-purple-500 to-violet-500" },
  { href: "/products/email-marketing", label: "Email Marketing", icon: Mail, desc: "Campaigns & automation", color: "from-sky-500 to-blue-500" },
  { href: "/products/ai-agents", label: "AI Agents", icon: Bot, desc: "Intelligent automation", color: "from-purple-500 to-violet-500" },
];

const solutionLinks = [
  { href: "/for/engineering-managers", label: "Engineering Managers", icon: Users, desc: "Visibility & planning tools", color: "from-blue-500 to-cyan-500" },
  { href: "/for/developers", label: "Developers", icon: Code2, desc: "No surveillance, just growth", color: "from-emerald-500 to-teal-500" },
  { href: "/for/engineering-leaders", label: "CTOs & VPs", icon: Briefcase, desc: "Scale with confidence", color: "from-purple-500 to-violet-500" },
  { href: "/for/people-ops", label: "HR & People Ops", icon: Heart, desc: "Hiring, reviews & L&D", color: "from-rose-500 to-pink-500" },
];

interface LandingHeaderProps {
  showGetStarted?: boolean;
}

export function LandingHeader({ showGetStarted = true }: LandingHeaderProps) {
  const [showProductsMenu, setShowProductsMenu] = useState(false);
  const [showSolutionsMenu, setShowSolutionsMenu] = useState(false);
  const productsRef = useRef<HTMLDivElement>(null);
  const solutionsRef = useRef<HTMLDivElement>(null);
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;
  const githubLoginUrl = `${API_BASE_URL}/auth/github/login`;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productsRef.current && !productsRef.current.contains(event.target as Node)) {
        setShowProductsMenu(false);
      }
      if (solutionsRef.current && !solutionsRef.current.contains(event.target as Node)) {
        setShowSolutionsMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-primary-500 blur-lg opacity-50" />
            <div className="relative p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
              <GitBranch className="h-6 w-6 text-white" />
            </div>
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
            Aexy
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {/* Products Dropdown */}
          <div className="relative" ref={productsRef}>
            <button
              onClick={() => { setShowProductsMenu(!showProductsMenu); setShowSolutionsMenu(false); }}
              className="flex items-center gap-1 text-white/60 hover:text-white transition text-sm"
            >
              Products
              <ChevronDown className={`h-4 w-4 transition-transform ${showProductsMenu ? "rotate-180" : ""}`} />
            </button>
            {showProductsMenu && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-[#12121a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                <div className="p-2 max-h-[70vh] overflow-y-auto">
                  {productLinks.map(({ href, label, icon: Icon, desc, color }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setShowProductsMenu(false)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm">{label}</div>
                        <div className="text-white/40 text-xs">{desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="border-t border-white/10 p-3">
                  <Link
                    href="/#pillars"
                    onClick={() => setShowProductsMenu(false)}
                    className="flex items-center justify-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition"
                  >
                    View all products
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Solutions Dropdown */}
          <div className="relative" ref={solutionsRef}>
            <button
              onClick={() => { setShowSolutionsMenu(!showSolutionsMenu); setShowProductsMenu(false); }}
              className="flex items-center gap-1 text-white/60 hover:text-white transition text-sm"
            >
              Solutions
              <ChevronDown className={`h-4 w-4 transition-transform ${showSolutionsMenu ? "rotate-180" : ""}`} />
            </button>
            {showSolutionsMenu && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-[#12121a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                <div className="p-2">
                  {solutionLinks.map(({ href, label, icon: Icon, desc, color }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setShowSolutionsMenu(false)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm">{label}</div>
                        <div className="text-white/40 text-xs">{desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link href="/story" className="text-white/60 hover:text-white transition text-sm">
            Our Story
          </Link>
          <Link href="/mission" className="text-white/60 hover:text-white transition text-sm">
            Mission
          </Link>
          <Link href="/manifesto" className="text-white/60 hover:text-white transition text-sm">
            Engineering OS
          </Link>
          <Link href="/pricing" className="text-white/60 hover:text-white transition text-sm">
            Pricing
          </Link>
          <a href="https://github.com/aexy-io/aexy" className="text-white/60 hover:text-white transition text-sm flex items-center gap-1">
            <SiGithub className="h-4 w-4" />
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {showGetStarted && (
            <>
              <a
                href={githubLoginUrl}
                className="hidden sm:flex text-white/70 hover:text-white transition text-sm font-medium items-center gap-1"
              >
                <SiGithub className="h-4 w-4" />
                Sign In
              </a>
              <a
                href={googleLoginUrl}
                className="group relative bg-white text-black px-3 sm:px-5 py-2 sm:py-2.5 rounded-full transition text-xs sm:text-sm font-semibold flex items-center gap-2 hover:bg-white/90"
              >
                Get Started
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </>
          )}

          {/* Mobile hamburger menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="md:hidden p-2 text-white/70 hover:text-white transition">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-[#0a0a0f] border-white/10 overflow-y-auto">
              <SheetTitle className="text-white text-lg font-bold mb-6">Menu</SheetTitle>
              <nav className="flex flex-col gap-6">
                <div>
                  <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Products</h3>
                  <div className="space-y-1">
                    {productLinks.map(({ href, label, icon: Icon, color }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition"
                      >
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-white/80 text-sm">{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Solutions</h3>
                  <div className="space-y-1">
                    {solutionLinks.map(({ href, label, icon: Icon, color }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition"
                      >
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-white/80 text-sm">{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Link href="/story" onClick={() => setMobileOpen(false)} className="block p-2 text-white/70 hover:text-white text-sm transition">Our Story</Link>
                  <Link href="/mission" onClick={() => setMobileOpen(false)} className="block p-2 text-white/70 hover:text-white text-sm transition">Mission</Link>
                  <Link href="/manifesto" onClick={() => setMobileOpen(false)} className="block p-2 text-white/70 hover:text-white text-sm transition">Engineering OS</Link>
                  <Link href="/pricing" onClick={() => setMobileOpen(false)} className="block p-2 text-white/70 hover:text-white text-sm transition">Pricing</Link>
                  <a href="https://github.com/aexy-io/aexy" className="flex items-center gap-2 p-2 text-white/70 hover:text-white text-sm transition">
                    <SiGithub className="h-4 w-4" />
                    GitHub
                  </a>
                </div>
                {showGetStarted && (
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <a
                      href={githubLoginUrl}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-white/20 rounded-full text-white text-sm font-medium hover:bg-white/5 transition"
                    >
                      <SiGithub className="h-4 w-4" />
                      Sign In with GitHub
                    </a>
                    <a
                      href={googleLoginUrl}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white text-black rounded-full text-sm font-semibold hover:bg-white/90 transition"
                    >
                      Get Started
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/5 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-6 gap-8 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl">
                <GitBranch className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">Aexy</span>
            </div>
            <p className="text-white/40 text-sm mb-4">
              The open-source operating system for engineering organizations.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://github.com/aexy-io/aexy" className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition">
                <SiGithub className="h-4 w-4 text-white/60" />
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Products</h4>
            <ul className="space-y-2 text-white/40 text-sm">
              <li><Link href="/products/tracking" className="hover:text-white transition">Activity Tracking</Link></li>
              <li><Link href="/products/planning" className="hover:text-white transition">Sprint Planning</Link></li>
              <li><Link href="/products/tickets" className="hover:text-white transition">Ticketing</Link></li>
              <li><Link href="/products/reviews" className="hover:text-white transition">Reviews</Link></li>
              <li><Link href="/products/learning" className="hover:text-white transition">Learning</Link></li>
              <li><Link href="/products/hiring" className="hover:text-white transition">Hiring</Link></li>
              <li><Link href="/products/crm" className="hover:text-white transition">CRM</Link></li>
              <li><Link href="/products/email-marketing" className="hover:text-white transition">Email Marketing</Link></li>
              <li><Link href="/products/ai-agents" className="hover:text-white transition">AI Agents</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Solutions</h4>
            <ul className="space-y-2 text-white/40 text-sm">
              <li><Link href="/for/engineering-managers" className="hover:text-white transition">For Managers</Link></li>
              <li><Link href="/for/developers" className="hover:text-white transition">For Developers</Link></li>
              <li><Link href="/for/engineering-leaders" className="hover:text-white transition">For CTOs</Link></li>
              <li><Link href="/for/people-ops" className="hover:text-white transition">For HR</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-white/40 text-sm">
              <li><Link href="/story" className="hover:text-white transition">Our Story</Link></li>
              <li><Link href="/mission" className="hover:text-white transition">Mission</Link></li>
              <li><Link href="/manifesto" className="hover:text-white transition">Engineering OS</Link></li>
              <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
              <li><a href="https://github.com/aexy-io/aexy" className="hover:text-white transition">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-white/40 text-sm">
              <li><Link href="/mission" className="hover:text-white transition">About</Link></li>
              <li><Link href="#" className="hover:text-white transition">Blog</Link></li>
              <li><Link href="#" className="hover:text-white transition">Careers</Link></li>
              <li><Link href="#" className="hover:text-white transition">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white/40 text-sm">&copy; 2025 Aexy. All rights reserved.</p>
          <div className="flex items-center gap-6 text-white/40 text-sm">
            <Link href="#" className="hover:text-white transition">Privacy Policy</Link>
            <Link href="#" className="hover:text-white transition">Terms of Service</Link>
            <Link href="#" className="hover:text-white transition">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
