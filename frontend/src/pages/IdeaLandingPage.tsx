import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { MarkdownRenderer } from "@/components/Ideas/MarkdownRenderer";
import {
  Loader2,
  ArrowLeft,
  Zap,
  Shield,
  Globe,
  Rocket,
  Target,
  Users,
  Lightbulb,
  TrendingUp,
  Lock,
  Eye,
  Heart,
  Star,
  Layers,
  Code,
  Database,
  Cpu,
  Wifi,
  Cloud,
  Award,
  CheckCircle,
  BarChart,
  Settings,
  ArrowRight,
  ChevronRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LandingPageContent {
  heroTitle: string;
  heroSubtitle: string;
  problemTitle: string;
  problemDescription: string;
  solutionTitle: string;
  solutionDescription: string;
  features: Array<{ title: string; description: string; icon: string }>;
  ctaTitle: string;
  ctaDescription: string;
  colorScheme: "blue" | "purple" | "orange" | "green" | "red";
}

interface IdeaApiResponse {
  idea: {
    id: string;
    title: string;
    slug: string;
    description: string;
    coin_name?: string;
    ticker?: string;
    generated_image_url?: string;
    landing_page?: LandingPageContent | string;
    [key: string]: unknown;
  };
}

// ─── Icon map ────────────────────────────────────────────────────────────────

const iconMap: Record<string, LucideIcon> = {
  Zap, Shield, Globe, Rocket, Target, Users, Lightbulb, TrendingUp,
  Lock, Eye, Heart, Star, Layers, Code, Database, Cpu, Wifi, Cloud,
  Award, CheckCircle, BarChart, Settings,
};

function isEmoji(str: string): boolean {
  return /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(str);
}

function resolveIcon(name: string): LucideIcon | null {
  if (isEmoji(name)) return null;
  return iconMap[name] || Zap;
}

// ─── Color schemes ───────────────────────────────────────────────────────────

const schemes = {
  blue: {
    accent: "59, 130, 246",       // rgb for blue-500
    accentHex: "#3b82f6",
    accentLight: "#60a5fa",
    gradient: "from-blue-500 to-cyan-400",
    gradientVia: "from-blue-500 via-blue-400 to-cyan-400",
    textAccent: "text-blue-400",
    bgAccent: "bg-blue-500",
    badgeBg: "bg-blue-500/10",
    badgeBorder: "border-blue-500/20",
    badgeText: "text-blue-400",
    btnBg: "bg-blue-500 hover:bg-blue-400",
    btnShadow: "shadow-blue-500/20 hover:shadow-blue-500/40",
    orbColor: "rgba(59, 130, 246, 0.08)",
    glassAccent: "rgba(59, 130, 246, 0.25)",
    statColor: "text-blue-400",
  },
  purple: {
    accent: "168, 85, 247",
    accentHex: "#a855f7",
    accentLight: "#c084fc",
    gradient: "from-purple-500 to-fuchsia-400",
    gradientVia: "from-purple-500 via-purple-400 to-fuchsia-400",
    textAccent: "text-purple-400",
    bgAccent: "bg-purple-500",
    badgeBg: "bg-purple-500/10",
    badgeBorder: "border-purple-500/20",
    badgeText: "text-purple-400",
    btnBg: "bg-purple-500 hover:bg-purple-400",
    btnShadow: "shadow-purple-500/20 hover:shadow-purple-500/40",
    orbColor: "rgba(168, 85, 247, 0.08)",
    glassAccent: "rgba(168, 85, 247, 0.25)",
    statColor: "text-purple-400",
  },
  orange: {
    accent: "249, 115, 22",
    accentHex: "#f97316",
    accentLight: "#fb923c",
    gradient: "from-orange-500 to-amber-400",
    gradientVia: "from-orange-500 via-orange-400 to-amber-400",
    textAccent: "text-orange-400",
    bgAccent: "bg-orange-500",
    badgeBg: "bg-orange-500/10",
    badgeBorder: "border-orange-500/20",
    badgeText: "text-orange-400",
    btnBg: "bg-orange-500 hover:bg-orange-400",
    btnShadow: "shadow-orange-500/20 hover:shadow-orange-500/40",
    orbColor: "rgba(249, 115, 22, 0.08)",
    glassAccent: "rgba(249, 115, 22, 0.25)",
    statColor: "text-orange-400",
  },
  green: {
    accent: "16, 185, 129",
    accentHex: "#10b981",
    accentLight: "#34d399",
    gradient: "from-emerald-500 to-teal-400",
    gradientVia: "from-emerald-500 via-emerald-400 to-teal-400",
    textAccent: "text-emerald-400",
    bgAccent: "bg-emerald-500",
    badgeBg: "bg-emerald-500/10",
    badgeBorder: "border-emerald-500/20",
    badgeText: "text-emerald-400",
    btnBg: "bg-emerald-500 hover:bg-emerald-400",
    btnShadow: "shadow-emerald-500/20 hover:shadow-emerald-500/40",
    orbColor: "rgba(16, 185, 129, 0.08)",
    glassAccent: "rgba(16, 185, 129, 0.25)",
    statColor: "text-emerald-400",
  },
  red: {
    accent: "239, 68, 68",
    accentHex: "#ef4444",
    accentLight: "#f87171",
    gradient: "from-red-500 to-rose-400",
    gradientVia: "from-red-500 via-red-400 to-rose-400",
    textAccent: "text-red-400",
    bgAccent: "bg-red-500",
    badgeBg: "bg-red-500/10",
    badgeBorder: "border-red-500/20",
    badgeText: "text-red-400",
    btnBg: "bg-red-500 hover:bg-red-400",
    btnShadow: "shadow-red-500/20 hover:shadow-red-500/40",
    orbColor: "rgba(239, 68, 68, 0.08)",
    glassAccent: "rgba(239, 68, 68, 0.25)",
    statColor: "text-red-400",
  },
};

// ─── Reusable animated section ───────────────────────────────────────────────

function FadeIn({ children, className = "", delay = 0 }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Staggered children ──────────────────────────────────────────────────────

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
};

// ─── Animated counter ────────────────────────────────────────────────────────

function AnimatedText({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <span ref={ref}>
      {isInView ? (
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {children}
        </motion.span>
      ) : (
        <span className="opacity-0">{children}</span>
      )}
    </span>
  );
}

// ─── Glass Badge ─────────────────────────────────────────────────────────────

function GlassBadge({ label, tag, s }: { label: string; tag?: string; s: typeof schemes.blue }) {
  return (
    <div className="inline-flex items-center gap-2 liquid-glass rounded-full px-4 py-2">
      <span className="text-xs font-medium text-neutral-300">{label}</span>
      {tag && (
        <span className={`flex items-center gap-1 text-xs font-semibold ${s.badgeText} ${s.badgeBg} ${s.badgeBorder} border rounded-full px-2.5 py-0.5`}>
          {tag}
          <ChevronRight className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function IdeaLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [idea, setIdea] = useState<IdeaApiResponse["idea"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, -120]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);

  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    fetch(`/api/ideas?slug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Idea not found");
        return res.json() as Promise<IdeaApiResponse>;
      })
      .then((data) => setIdea(data.idea))
      .catch((err) => setError(err.message || "Failed to load idea"))
      .finally(() => setLoading(false));
  }, [slug]);

  // Trigger lazy generation if landing page doesn't exist
  useEffect(() => {
    if (!idea || generating) return;
    const rawLpCheck = idea.landing_page;
    const lpCheck = typeof rawLpCheck === "string"
      ? (() => { try { return JSON.parse(rawLpCheck) } catch { return undefined } })()
      : rawLpCheck;
    if (lpCheck && lpCheck.heroTitle) return; // already has LP
    setGenerating(true);
    fetch('/api/trigger-landing-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: idea.id }),
    })
      .then((res) => res.json())
      .then((data: { status?: string }) => {
        if (data.status === 'generating') {
          // Poll until landing page is ready (check every 3s, max 30s)
          let attempts = 0;
          const poll = setInterval(() => {
            attempts++;
            if (attempts > 10) { clearInterval(poll); setGenerating(false); return; }
            fetch(`/api/ideas?slug=${encodeURIComponent(slug!)}`)
              .then((r) => r.json())
              .then((d: IdeaApiResponse) => {
                if (d.idea?.landing_page) {
                  clearInterval(poll);
                  setIdea(d.idea);
                  setGenerating(false);
                }
              })
              .catch(() => {});
          }, 3000);
        } else {
          setGenerating(false);
        }
      })
      .catch(() => setGenerating(false));
  }, [idea]);

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08061a] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (error || !idea) {
    return (
      <div className="min-h-screen bg-[#08061a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400 mb-4">{error || "Idea not found"}</p>
          <Link to={slug ? `/ideas/${slug}` : "/ideas"} className="text-sm text-neutral-500 hover:text-white transition-colors">
            Go back
          </Link>
        </div>
      </div>
    );
  }

  const rawLp = idea.landing_page;
  const lp: LandingPageContent | undefined = typeof rawLp === "string"
    ? (() => { try { return JSON.parse(rawLp) } catch { return undefined } })()
    : rawLp;
  const isLpComplete = lp && lp.heroTitle && lp.heroSubtitle && Array.isArray(lp.features);

  if (!isLpComplete) {
    return (
      <div className="min-h-screen bg-[#08061a] flex items-center justify-center">
        <div className="text-center">
          {generating ? (
            <>
              <Loader2 className="w-6 h-6 text-neutral-500 animate-spin mx-auto mb-4" />
              <p className="text-neutral-400">Generating landing page...</p>
            </>
          ) : (
            <p className="text-neutral-400 mb-4">No landing page available.</p>
          )}
          <Link to={`/ideas/${slug}`} className="text-sm text-neutral-500 hover:text-white transition-colors mt-4 block">
            View idea
          </Link>
        </div>
      </div>
    );
  }

  const s = schemes[lp.colorScheme] || schemes.blue;

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden font-geist"
      style={{ background: "hsl(260 87% 3%)" }}
    >
      {/* ── Ambient background noise ── */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.012]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Large ambient orbs ── */}
      <div
        className="fixed top-0 left-1/4 w-[800px] h-[800px] rounded-full blur-[200px] pointer-events-none"
        style={{ background: s.orbColor }}
      />
      <div
        className="fixed bottom-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[180px] pointer-events-none"
        style={{ background: s.orbColor }}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* NAVBAR                                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <nav className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4">
        <div className="liquid-glass rounded-2xl max-w-[720px] w-full px-5 py-2.5 flex items-center justify-between">
          <Link
            to={`/ideas/${slug}`}
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">Back to idea</span>
          </Link>

          <div className="flex items-center gap-3">
            {idea.ticker && (
              <span className="text-xs font-mono text-neutral-500 tracking-wider">
                ${idea.ticker}
              </span>
            )}
            <Link
              to={`/ideas/${slug}`}
              className={`${s.btnBg} text-white text-sm font-medium rounded-full px-5 py-2 transition-all ${s.btnShadow} shadow-lg hover:shadow-xl hover:scale-[1.02]`}
            >
              Fund This Idea
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HERO                                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Radial glow behind hero */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-[160px] pointer-events-none"
          style={{ background: `rgba(${s.accent}, 0.06)` }}
        />

        {/* Gradient fade at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none"
          style={{
            background: "linear-gradient(to top, hsl(260 87% 3%) 0%, hsl(260 87% 3% / 0.8) 40%, transparent 100%)",
          }}
        />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center pt-28 pb-20"
        >
          {/* Token badges */}
          {(idea.coin_name || idea.ticker) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex items-center justify-center gap-2 mb-10"
            >
              <div className="liquid-glass rounded-full px-4 py-1.5 flex items-center gap-2">
                {idea.coin_name && (
                  <span className={`text-xs font-semibold ${s.badgeText}`}>
                    {idea.coin_name}
                  </span>
                )}
                {idea.ticker && (
                  <>
                    <span className="w-px h-3 bg-white/10" />
                    <span className="text-xs font-mono text-neutral-400">
                      ${idea.ticker}
                    </span>
                  </>
                )}
                <ChevronRight className="w-3 h-3 text-neutral-500" />
              </div>
            </motion.div>
          )}

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[1.05] tracking-tight mb-6"
            style={{ color: "hsl(40 10% 96%)" }}
          >
            {lp.heroTitle.split(" / ").map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {i === 0 ? (
                  <span className={`bg-gradient-to-r ${s.gradientVia} bg-clip-text text-transparent`}>
                    {line}
                  </span>
                ) : (
                  line
                )}
              </span>
            ))}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
            className="text-lg max-w-xl mx-auto leading-relaxed mb-10"
            style={{ color: "hsl(40 6% 72%)" }}
          >
            {lp.heroSubtitle}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to={`/ideas/${slug}`}
              className={`group ${s.btnBg} text-white rounded-full px-8 py-3.5 text-base font-medium transition-all ${s.btnShadow} shadow-lg hover:shadow-2xl hover:scale-[1.02] flex items-center gap-2`}
            >
              Fund This Idea
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#features"
              className="liquid-glass rounded-full px-8 py-3.5 text-base text-neutral-300 hover:text-white hover:bg-white/[0.03] transition-all"
            >
              Learn More
            </a>
          </motion.div>

          {/* Generated image */}
          {idea.generated_image_url && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.9, duration: 0.8 }}
              className="max-w-lg mx-auto mt-20"
            >
              <div className="liquid-glass rounded-3xl p-1.5">
                <img
                  src={idea.generated_image_url}
                  alt={idea.title}
                  className="w-full h-auto rounded-[1.25rem]"
                />
              </div>
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PROBLEM / SOLUTION — Chess layout                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-32 px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left — Problem (visual card) */}
          <FadeIn>
            <div
              className="liquid-glass liquid-glass-accent rounded-3xl p-10 sm:p-12 relative"
              style={{ "--glass-accent": `rgba(${s.accent}, 0.2)` } as React.CSSProperties}
            >
              {/* Subtle accent orb */}
              <div
                className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-[100px] pointer-events-none"
                style={{ background: `rgba(${s.accent}, 0.06)` }}
              />
              <div className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-2 h-2 rounded-full ${s.bgAccent}`} />
                  <span className={`text-xs font-semibold uppercase tracking-widest ${s.badgeText}`}>
                    The Problem
                  </span>
                </div>
                <h2
                  className="text-2xl sm:text-3xl font-semibold mb-6 leading-tight"
                  style={{ color: "hsl(40 10% 96%)" }}
                >
                  {lp.problemTitle}
                </h2>
                <p className="text-[15px] leading-[1.8] text-neutral-400">
                  {lp.problemDescription}
                </p>
              </div>
            </div>
          </FadeIn>

          {/* Right — Solution (content) */}
          <FadeIn delay={0.15}>
            <div className="lg:pl-4">
              <GlassBadge label="The Solution" tag="How it works" s={s} />
              <h2
                className="text-2xl sm:text-3xl font-semibold mt-6 mb-6 leading-tight"
                style={{ color: "hsl(40 10% 96%)" }}
              >
                {lp.solutionTitle}
              </h2>
              <p className="text-[15px] leading-[1.8] text-neutral-400 mb-8">
                {lp.solutionDescription}
              </p>

              {/* Bullet points from description if available */}
              <div className="flex flex-col gap-3">
                {lp.features.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                      style={{ background: `rgb(${s.accent})` }}
                    />
                    <span className="text-sm text-neutral-300">{f.title}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link
                  to={`/ideas/${slug}`}
                  className={`group ${s.btnBg} text-white rounded-full px-6 py-3 text-sm font-medium transition-all ${s.btnShadow} shadow-lg hover:shadow-xl hover:scale-[1.02] inline-flex items-center gap-2`}
                >
                  See It in Action
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FEATURES — 3-Column Cards                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section id="features" className="relative py-32 px-4">
        {/* Section background glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full blur-[200px] pointer-events-none"
          style={{ background: `rgba(${s.accent}, 0.03)` }}
        />

        <div className="max-w-6xl mx-auto relative">
          {/* Header */}
          <FadeIn>
            <div className="text-center mb-20">
              <GlassBadge label="Core Features" tag="Overview" s={s} />
              <h2
                className="text-3xl sm:text-5xl font-semibold mt-6 leading-tight tracking-tight"
                style={{ color: "hsl(40 10% 96%)" }}
              >
                Built for What Matters
              </h2>
              <p className="text-neutral-500 mt-4 text-base max-w-md mx-auto">
                Three pillars that make this idea work.
              </p>
            </div>
          </FadeIn>

          {/* Cards */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid md:grid-cols-3 gap-6"
          >
            {lp.features.map((feature, i) => {
              const Icon = resolveIcon(feature.icon);
              return (
                <motion.div
                  key={i}
                  variants={staggerItem}
                  whileHover={{ y: -6, transition: { duration: 0.25, ease: "easeOut" } }}
                  className="group liquid-glass rounded-3xl p-8 hover:bg-white/[0.02] transition-colors cursor-default"
                >
                  {/* Icon */}
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${s.badgeBg} ${s.badgeBorder} border transition-transform group-hover:scale-110 duration-300`}
                  >
                    {Icon ? (
                      <Icon className={`w-6 h-6 ${s.textAccent}`} />
                    ) : (
                      <span className="text-xl">{feature.icon}</span>
                    )}
                  </div>

                  {/* Content */}
                  <h3
                    className="text-base font-semibold mb-3"
                    style={{ color: "hsl(40 10% 96%)" }}
                  >
                    {feature.title}
                  </h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Divider + Stat area */}
                  <div className="mt-6 pt-5 border-t border-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <Sparkles className={`w-3.5 h-3.5 ${s.textAccent}`} />
                      <span className="text-xs text-neutral-500">
                        {["Core feature", "Key capability", "Essential"][i % 3]}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* NUMBERS                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-32 px-4">
        {/* Background glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(${s.accent}, 0.04) 0%, transparent 70%)`,
          }}
        />

        <div className="max-w-6xl mx-auto relative">
          <FadeIn>
            <div className="text-center mb-24">
              <h2
                className="text-7xl sm:text-[8rem] lg:text-[10rem] font-semibold tracking-tighter leading-none"
                style={{ color: "hsl(40 10% 96%)" }}
              >
                <span className={`bg-gradient-to-r ${s.gradientVia} bg-clip-text text-transparent`}>
                  {idea.ticker ? `$${idea.ticker}` : idea.title}
                </span>
              </h2>
              <p className="text-neutral-500 text-sm mt-4 uppercase tracking-widest">
                {idea.coin_name || "Project Token"}
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="liquid-glass rounded-3xl p-10 sm:p-12 grid md:grid-cols-3 gap-8">
              <div className="text-center md:text-left">
                <div className={`text-4xl sm:text-5xl font-semibold ${s.statColor} tracking-tight`}>
                  <AnimatedText>100%</AnimatedText>
                </div>
                <p className="text-sm text-neutral-500 mt-2">Community-driven</p>
              </div>
              <div className="text-center md:border-x border-white/[0.04] md:px-8">
                <div className={`text-4xl sm:text-5xl font-semibold ${s.statColor} tracking-tight`}>
                  <AnimatedText>Fair</AnimatedText>
                </div>
                <p className="text-sm text-neutral-500 mt-2">Launch mechanics</p>
              </div>
              <div className="text-center md:text-right">
                <div className={`text-4xl sm:text-5xl font-semibold ${s.statColor} tracking-tight`}>
                  <AnimatedText>Open</AnimatedText>
                </div>
                <p className="text-sm text-neutral-500 mt-2">For everyone</p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DESCRIPTION — Reverse Chess (Content Left, Image/Card Right)       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-32 px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left — Content */}
          <FadeIn className="order-2 lg:order-1">
            <GlassBadge label={idea.title} tag="Vision" s={s} />
            <h2
              className="text-2xl sm:text-3xl font-semibold mt-6 mb-6 leading-tight"
              style={{ color: "hsl(40 10% 96%)" }}
            >
              Why {idea.title}?
            </h2>
            <div className="text-[15px] leading-[1.8] text-neutral-400 mb-8">
              <MarkdownRenderer content={idea.description} />
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              {lp.features.slice(0, 4).map((f, i) => {
                const Icon = resolveIcon(f.icon);
                return (
                  <div key={i} className="liquid-glass rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      {Icon ? (
                        <Icon className={`w-3.5 h-3.5 ${s.textAccent}`} />
                      ) : (
                        <span className="text-sm">{f.icon}</span>
                      )}
                      <span className={`text-sm font-semibold ${s.statColor}`}>{f.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Link
              to={`/ideas/${slug}`}
              className={`group ${s.btnBg} text-white rounded-full px-6 py-3 text-sm font-medium transition-all ${s.btnShadow} shadow-lg hover:shadow-xl hover:scale-[1.02] inline-flex items-center gap-2`}
            >
              Support This Project
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </FadeIn>

          {/* Right — Visual card */}
          <FadeIn delay={0.15} className="order-1 lg:order-2">
            <div
              className="liquid-glass liquid-glass-accent rounded-3xl aspect-square sm:aspect-[4/3] flex items-center justify-center relative"
              style={{ "--glass-accent": `rgba(${s.accent}, 0.15)` } as React.CSSProperties}
            >
              {/* Inner glow */}
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(${s.accent}, 0.06) 0%, transparent 70%)`,
                }}
              />
              {idea.generated_image_url ? (
                <img
                  src={idea.generated_image_url}
                  alt={idea.title}
                  className="w-full h-full object-cover rounded-3xl"
                />
              ) : (
                <div className="text-center px-8 relative">
                  <div
                    className="text-8xl font-bold opacity-10 tracking-tighter"
                    style={{ color: `rgb(${s.accent})` }}
                  >
                    {idea.title.charAt(0)}
                  </div>
                  <div className={`text-lg font-semibold ${s.textAccent} mt-2`}>
                    {idea.title}
                  </div>
                </div>
              )}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CTA                                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-32 px-4">
        {/* Ambient glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-[180px] pointer-events-none"
          style={{ background: `rgba(${s.accent}, 0.05)` }}
        />

        <FadeIn>
          <div
            className="liquid-glass liquid-glass-accent rounded-[2rem] max-w-3xl mx-auto p-12 sm:p-20 text-center relative"
            style={{ "--glass-accent": `rgba(${s.accent}, 0.15)` } as React.CSSProperties}
          >
            {/* Inner orb */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 rounded-full blur-[100px] pointer-events-none"
              style={{ background: `rgba(${s.accent}, 0.06)` }}
            />

            <div className="relative">
              <h2
                className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight tracking-tight mb-6"
                style={{ color: "hsl(40 10% 96%)" }}
              >
                {lp.ctaTitle}
              </h2>
              <p className="text-base text-neutral-400 max-w-lg mx-auto mb-10 leading-relaxed">
                {lp.ctaDescription}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to={`/ideas/${slug}`}
                  className={`group ${s.btnBg} text-white rounded-full px-8 py-3.5 text-base font-medium transition-all ${s.btnShadow} shadow-lg hover:shadow-2xl hover:scale-[1.02] flex items-center gap-2`}
                >
                  <Rocket className="w-4 h-4" />
                  Fund This Idea
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to="/ideas"
                  className="liquid-glass rounded-full px-8 py-3.5 text-base text-neutral-300 hover:text-white hover:bg-white/[0.03] transition-all"
                >
                  Explore Ideas
                </Link>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* FOOTER                                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.04] py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-lg ${s.badgeBg} ${s.badgeBorder} border flex items-center justify-center`}>
                <Sparkles className={`w-3 h-3 ${s.textAccent}`} />
              </div>
              <span className="text-sm text-neutral-500">{idea.title}</span>
            </div>
            <div className="flex items-center gap-6">
              <Link to={`/ideas/${slug}`} className="text-xs text-neutral-600 hover:text-white transition-colors">
                View Idea
              </Link>
              <Link to="/ideas" className="text-xs text-neutral-600 hover:text-white transition-colors">
                Explore
              </Link>
              <span className="text-xs text-neutral-700">
                Powered by Spark
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
