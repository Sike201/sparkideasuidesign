import { useRef, useEffect, useState, ReactNode } from "react";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Zap, Rocket, Coins, Droplet, TrendingUp, Star, Trophy, ExternalLink, Copy, ArrowRight, Lightbulb, Code, ChevronDown, Twitter, Send } from "lucide-react";
import { SEO } from "@/components/SEO";
import { CONTRACT_ADDRESS, cn } from "@/utils/sparkUtils";

// ─── Utility: Scroll-triggered section wrapper ───
function RevealSection({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Animated counter ───
function AnimatedCounter({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [isInView, target]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

// ─── Floating Orb component ───
function FloatingOrb({ size, x, y, delay, color }: { size: number; x: string; y: string; delay: number; color: string }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, left: x, top: y, background: color, filter: `blur(${size * 0.6}px)` }}
      animate={{ y: [0, -30, 0], x: [0, 15, 0], scale: [1, 1.1, 1] }}
      transition={{ duration: 6 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

// ─── Main Landing Page ───
export default function LandingPageV2() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const [copied, setCopied] = useState(false);

  const copyCA = () => {
    navigator.clipboard.writeText(CONTRACT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white antialiased selection:bg-orange-500/20 selection:text-orange-400 overflow-x-hidden">
      <SEO path="/" />

      {/* ━━━ NAV ━━━ */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-black/40 border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5">
            <img src="/sparklogo.png" alt="Spark" className="h-7 w-auto" />
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="#services" className="text-[13px] text-neutral-500 hover:text-white transition-colors font-medium tracking-wide">Services</a>
            <a href="#track-record" className="text-[13px] text-neutral-500 hover:text-white transition-colors font-medium tracking-wide">Track Record</a>
            <a href="#launchpad" className="text-[13px] text-neutral-500 hover:text-white transition-colors font-medium tracking-wide">LaunchPad</a>
            <a href="#token" className="text-[13px] text-neutral-500 hover:text-white transition-colors font-medium tracking-wide">$SPARK</a>
          </div>
          <a
            href="https://t.me/Mathis_btc"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative px-5 py-2 text-[13px] font-semibold text-black bg-gradient-to-r from-orange-400 to-amber-400 rounded-full overflow-hidden transition-all hover:shadow-lg hover:shadow-orange-500/25"
          >
            <span className="relative z-10 flex items-center gap-1.5">
              Build with Spark
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>
      </nav>

      {/* ━━━ HERO ━━━ */}
      <div ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <FloatingOrb size={500} x="50%" y="30%" delay={0} color="rgba(242, 92, 5, 0.08)" />
          <FloatingOrb size={300} x="20%" y="60%" delay={1.5} color="rgba(242, 159, 4, 0.06)" />
          <FloatingOrb size={200} x="75%" y="20%" delay={3} color="rgba(242, 92, 5, 0.05)" />
          <FloatingOrb size={150} x="85%" y="70%" delay={2} color="rgba(242, 159, 4, 0.04)" />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "80px 80px",
            }}
          />
          {/* Radial gradient overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#030303_70%)]" />
        </div>

        <motion.div style={{ opacity: heroOpacity, scale: heroScale, y: heroY }} className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24 pb-28">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-orange-500/20 bg-orange-500/[0.06] mb-10"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
            </span>
            <span className="text-orange-400 text-xs font-semibold tracking-widest uppercase font-satoshi">Web3 Ecosystem Builder</span>
          </motion.div>

          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="font-satoshi font-black text-[clamp(3rem,8vw,7rem)] leading-[0.95] tracking-tighter mb-6"
          >
            <span className="block">From Idea</span>
            <span className="block bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
              To Market
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-12 leading-relaxed font-geist"
          >
            Spark partners with Web3 teams from the first concept to active, liquid markets.
            Strategy, launch, liquidity, and growth — all under one roof.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a
              href="https://t.me/Mathis_btc"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative w-full sm:w-auto px-8 py-3.5 bg-white text-black font-bold text-sm rounded-xl overflow-hidden transition-all hover:shadow-xl hover:shadow-white/10 flex items-center justify-center gap-2.5 font-satoshi"
            >
              <span className="relative z-10">Build With Us</span>
              <Zap className="relative z-10 w-4 h-4 fill-black" />
              <div className="absolute inset-0 bg-gradient-to-r from-orange-100 to-amber-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </a>
            <Link
              to="/ideas"
              className="group relative w-full sm:w-auto px-8 py-3.5 text-sm font-bold text-black bg-gradient-to-r from-orange-400 to-amber-400 rounded-xl overflow-hidden transition-all hover:shadow-xl hover:shadow-orange-500/25 flex items-center justify-center gap-2.5 font-satoshi"
            >
              <span className="relative z-10">Our new product: LaunchPad for Ideas</span>
              <Rocket className="relative z-10 w-4 h-4" />
            </Link>
          </motion.div>

        </motion.div>

        {/* Scroll indicator — positioned relative to hero wrapper */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-[10px] text-neutral-600 uppercase tracking-[0.2em] font-satoshi">Scroll</span>
            <ChevronDown className="w-4 h-4 text-neutral-600" />
          </motion.div>
        </motion.div>
      </div>

      {/* ━━━ SERVICES ━━━ */}
      <section id="services" className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <RevealSection>
            <div className="max-w-2xl mb-20">
              <span className="text-orange-500 text-xs font-bold tracking-[0.2em] uppercase font-satoshi mb-4 block">What we do</span>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight font-satoshi leading-[1.1] mb-5">
                End-to-end Web3<br />project infrastructure
              </h2>
              <p className="text-neutral-500 text-lg leading-relaxed font-geist">
                We take projects from tokenomics to thriving markets. Strategy, capital, liquidity, growth — all aligned for long-term success.
              </p>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Rocket, title: "Launch Tokens", desc: "Tokenomics design, narrative crafting, and full launch execution on Solana.", accent: "from-orange-500/20 to-orange-500/0" },
              { icon: Coins, title: "Raise Capital", desc: "Fundraising through our launchpad, SwissBorg partnership, and investor network.", accent: "from-amber-500/20 to-amber-500/0" },
              { icon: Droplet, title: "Deploy Liquidity", desc: "On-chain liquidity design, market making strategies, and exchange access.", accent: "from-orange-600/20 to-orange-600/0" },
              { icon: TrendingUp, title: "Scale Growth", desc: "Community building, strategic partnerships, and sustainable market expansion.", accent: "from-yellow-500/20 to-yellow-500/0" },
            ].map((service, i) => (
              <RevealSection key={i} delay={i * 0.1}>
                <div className="group relative h-full p-7 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-orange-500/20 transition-all duration-500">
                  {/* Glow on hover */}
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${service.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-orange-500/20 transition-all duration-500">
                      <service.icon className="w-5 h-5 text-orange-400" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 font-satoshi">{service.title}</h3>
                    <p className="text-sm text-neutral-500 leading-relaxed font-geist">{service.desc}</p>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>

          <RevealSection delay={0.5} className="mt-16 text-center">
            <p className="text-xl md:text-2xl font-satoshi font-bold text-white/80 italic">
              "Our goal is not hype. Our goal is sustainable markets."
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ━━━ STATS ━━━ */}
      <section id="track-record" className="relative py-32 border-y border-white/[0.04]">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/[0.02] via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-6">
          <RevealSection>
            <div className="text-center mb-20">
              <span className="text-orange-500 text-xs font-bold tracking-[0.2em] uppercase font-satoshi mb-4 block">Track Record</span>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight font-satoshi">
                Numbers don't lie
              </h2>
            </div>
          </RevealSection>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-24">
            {[
              { value: 3, prefix: "$", suffix: "M+", label: "Total Raised" },
              { value: 12, suffix: "+", label: "Projects Launched" },
              { value: 5000, suffix: "+", label: "Investors Onboarded" },
              { value: 500, prefix: "$", suffix: "K+", label: "Generated by Supported Projects" },
            ].map((stat, i) => (
              <RevealSection key={i} delay={i * 0.12}>
                <div className="group relative p-8 rounded-2xl border border-white/[0.06] bg-white/[0.015] hover:border-orange-500/20 transition-all duration-500 text-center overflow-hidden h-full flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-b from-orange-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10">
                    <div className="text-4xl md:text-5xl font-black text-white tracking-tight font-satoshi mb-2">
                      <AnimatedCounter target={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                    </div>
                    <div className="text-[10px] md:text-xs text-neutral-500 font-semibold uppercase tracking-[0.15em] font-satoshi">{stat.label}</div>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>

          {/* Testimonials */}
          <RevealSection>
            <p className="text-xs font-bold text-neutral-600 uppercase tracking-[0.2em] mb-10 text-center font-satoshi">Trusted by</p>
          </RevealSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: "VNX", image: "/vnx.png",
                role: "RWA Issuer - Regulated in Europe",
                url: "https://www.vnx.li/",
                quote: "Spark supported the $VNX token sale with strategic guidance and launch infrastructure. The collaboration resulted in selling out in just 13 seconds.",
              },
              {
                name: "ZeroSpread", image: "/zerospread.png",
                role: "Market Maker - 100M AUM",
                url: "https://zerospread.io/",
                quote: "For over a year, we've been working with BorgPad on project launches. Efficient, dedicated, and professional. A real pleasure!",
              },
              {
                name: "Anthony", image: "/antho.png",
                role: "CSO - Founder SwissBorg",
                url: "https://x.com/AnthoLGSB",
                quote: "A dedicated team on a mission to see our ecosystem evolve positively. Healthy approach to tokenomics, LP, and launch.",
              },
              {
                name: "Omnipair", image: "/omnipair.png",
                role: "DEX - Solana",
                url: "https://omnipair.io/",
                quote: "",
              },
              {
                name: "Global Dollar Network", image: "/usdg.png",
                role: "Stablecoin Infrastructure",
                url: "https://www.globaldollar.com/",
                quote: "",
              },
            ].map((t, i) => (
              <RevealSection key={i} delay={i * 0.15}>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block h-full p-7 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-orange-500/20 hover:bg-white/[0.04] transition-all duration-500"
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <img src={t.image} alt={t.name} className="w-10 h-10 object-contain" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm font-satoshi">{t.name}</h4>
                      <p className="text-[11px] text-orange-400/80 font-satoshi">{t.role}</p>
                      <div className="flex gap-0.5 mt-1">
                        {[...Array(5)].map((_, j) => (
                          <Star key={j} className="w-3 h-3 fill-orange-500 text-orange-500" strokeWidth={0} />
                        ))}
                      </div>
                    </div>
                  </div>
                  {t.quote && <p className="text-sm text-neutral-400 leading-relaxed font-geist">{t.quote}</p>}
                </a>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ CASE STUDIES ━━━ */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <RevealSection>
            <div className="max-w-2xl mb-20">
              <span className="text-orange-500 text-xs font-bold tracking-[0.2em] uppercase font-satoshi mb-4 block">Case Studies</span>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight font-satoshi leading-[1.1]">
                Real projects,<br />real results
              </h2>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Solana Wrapped 2025",
                desc: "We built the definitive on-chain recap for the Solana ecosystem. Shared twice by @solana.",
                tags: ["Shared twice by @solana"],
                stats: [{ v: "+150k", l: "Impressions" }, { v: "2k+", l: "Users" }],
                url: "https://x.com/JustSparkIdeas/status/1997244911318712762",
                logo: null,
              },
              {
                title: "VNX",
                subtitle: "RWA Issuer - Europe",
                desc: "Strategic guidance and launch infrastructure. Sold out in just 13 seconds.",
                tags: ["LaunchPad", "TGE", "LP Management"],
                stats: [{ v: "$500k", l: "Raised" }],
                url: "https://www.vnx.li/",
                logo: "/vnx.png",
              },
              {
                title: "Omnipair",
                desc: "DEX launch support with $200k+ liquidity, partner access and communication.",
                tags: ["Capital Access", "Strategic Partners"],
                stats: [{ v: "$200k", l: "Liquidity" }],
                url: "https://borgpad.com/launch-pools/gold-yield",
                logo: "/omnipair.png",
              },
            ].map((study, i) => (
              <RevealSection key={i} delay={i * 0.12}>
                <div className="group relative h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-orange-500/20 overflow-hidden transition-all duration-500">
                  {/* Top accent line */}
                  <div className="h-[2px] bg-gradient-to-r from-orange-500/40 via-amber-500/40 to-transparent" />
                  <div className="p-7 flex flex-col gap-4 h-full">
                    <div className="flex items-center gap-2 text-orange-400 text-[10px] font-bold uppercase tracking-[0.2em] font-satoshi">
                      <Trophy className="w-3.5 h-3.5" />
                      Case Study
                    </div>
                    <div className="flex items-center gap-3">
                      {study.logo && (
                        <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <img src={study.logo} alt={study.title} className="w-9 h-9 object-contain" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-bold text-white font-satoshi">{study.title}</h3>
                        {study.subtitle && <p className="text-[11px] text-orange-400/80 font-satoshi">{study.subtitle}</p>}
                      </div>
                    </div>
                    <p className="text-sm text-neutral-400 leading-relaxed font-geist">{study.desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {study.tags.map((tag, j) => (
                        <span key={j} className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/15 font-satoshi">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-5 mt-auto pt-5 border-t border-white/[0.06]">
                      {study.stats.map((s, j) => (
                        <div key={j}>
                          <div className="text-2xl font-black text-white tracking-tight font-satoshi">{s.v}</div>
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.15em] font-satoshi">{s.l}</div>
                        </div>
                      ))}
                    </div>
                    {study.url && (
                      <a href={study.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors font-satoshi mt-1">
                        Learn more <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ LAUNCHPAD IDEAS ━━━ */}
      <section id="launchpad" className="relative py-32 border-y border-white/[0.04]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-orange-500/[0.02] to-transparent" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <RevealSection>
              <div>
                <span className="text-orange-500 text-xs font-bold tracking-[0.2em] uppercase font-satoshi mb-4 block">Our Latest Product</span>
                <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight font-satoshi leading-[1.1] mb-6">
                  LaunchPad<br />
                  <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">for Ideas</span>
                </h2>
                <p className="text-neutral-400 text-lg leading-relaxed font-geist mb-8">
                  Submit your idea, get funded by the community, and launch your token on Solana.
                  Our community-driven platform lets you submit, discuss, and vote on the next big Web3 project.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    to="/ideas"
                    className="group inline-flex items-center gap-2.5 px-7 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold text-sm rounded-xl transition-all hover:shadow-lg hover:shadow-orange-500/25 font-satoshi"
                  >
                    Explore Ideas
                    <Lightbulb className="w-4 h-4 transition-transform group-hover:rotate-12" />
                  </Link>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.2}>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex flex-col items-center text-center">
                  <Lightbulb className="w-8 h-8 text-orange-400 mb-3" />
                  <span className="text-sm font-bold text-white font-satoshi">Submit Ideas</span>
                  <span className="text-xs text-neutral-500 mt-1 font-geist">Share your vision</span>
                </div>
                <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex flex-col items-center text-center">
                  <Star className="w-8 h-8 text-amber-400 mb-3" />
                  <span className="text-sm font-bold text-white font-satoshi">Community Votes</span>
                  <span className="text-xs text-neutral-500 mt-1 font-geist">Democratic selection</span>
                </div>
                <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex flex-col items-center text-center">
                  <Coins className="w-8 h-8 text-orange-400 mb-3" />
                  <span className="text-sm font-bold text-white font-satoshi">Get Funded</span>
                  <span className="text-xs text-neutral-500 mt-1 font-geist">Community backing</span>
                </div>
                <div className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex flex-col items-center text-center">
                  <Rocket className="w-8 h-8 text-amber-400 mb-3" />
                  <span className="text-sm font-bold text-white font-satoshi">Launch Token</span>
                  <span className="text-xs text-neutral-500 mt-1 font-geist">Go live on Solana</span>
                </div>
              </div>
            </RevealSection>
          </div>

          {/* Hackathons teaser */}
          <RevealSection delay={0.3} className="mt-20">
            <Link to="/hackathons" className="block p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-orange-500/20 hover:bg-white/[0.04] transition-all duration-500 flex flex-col md:flex-row items-center justify-between gap-6 group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                  <Trophy className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-satoshi">Hackathons</h3>
                  <p className="text-sm text-neutral-500 font-geist">Builder-focused events to turn ideas into real Web3 startups.</p>
                </div>
              </div>
              <span className="px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs font-bold text-orange-400 uppercase tracking-[0.15em] font-satoshi shrink-0">
                Live
              </span>
            </Link>
          </RevealSection>
        </div>
      </section>

      {/* ━━━ $SPARK TOKEN ━━━ */}
      <section id="token" className="relative py-32 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/[0.06] rounded-full blur-[150px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <RevealSection>
              <div>
                <span className="text-orange-500 text-xs font-bold tracking-[0.2em] uppercase font-satoshi mb-4 block">Token</span>
                <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight font-satoshi leading-[1.1] mb-4">
                  $SPARK
                </h2>
                <p className="text-xl text-orange-400 font-semibold mb-6 font-satoshi">
                  Own a piece of the ecosystem.
                </p>
                <p className="text-neutral-400 text-lg leading-relaxed font-geist mb-8">
                  We don't see token holders as a community — we see you as partners.
                  We're transitioning toward a model where $SPARK represents true ownership in everything we build.
                </p>

                {/* Contract address */}
                <div
                  onClick={copyCA}
                  className="group inline-flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-3 cursor-pointer hover:border-orange-500/30 transition-all duration-300 mb-8"
                >
                  <span className="text-[11px] text-neutral-600 font-bold uppercase tracking-wider font-satoshi">CA</span>
                  <span className="text-sm text-neutral-300 font-geist-mono">{CONTRACT_ADDRESS}</span>
                  <Copy className="w-4 h-4 text-neutral-500 group-hover:text-orange-400 transition-colors" />
                  <AnimatePresence>
                    {copied && (
                      <motion.span
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-orange-400 font-bold font-satoshi"
                      >
                        Copied!
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href={`https://jup.ag/tokens/${CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold text-sm rounded-xl overflow-hidden transition-all hover:shadow-lg hover:shadow-orange-500/25 font-satoshi flex items-center justify-center gap-2"
                  >
                    BUY $SPARK
                    <Zap className="w-4 h-4 fill-black" />
                    {/* Shine sweep */}
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </a>
                  <a
                    href="https://t.me/sparkdotfun"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-8 py-3.5 text-sm font-semibold text-neutral-400 hover:text-white border border-white/[0.08] rounded-xl transition-all hover:border-white/20 flex items-center justify-center gap-2 font-satoshi"
                  >
                    <Send className="w-4 h-4" />
                    Telegram
                  </a>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.2}>
              <div className="flex items-center justify-center">
                <motion.div
                  animate={{ y: [0, -15, 0], rotate: [0, 2, 0, -2, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="relative"
                >
                  <img src="/spark-coin.png" alt="$SPARK Token" className="w-64 h-64 md:w-80 md:h-80 object-contain drop-shadow-2xl" />
                  {/* Glow behind coin */}
                  <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-[60px] -z-10 scale-75" />
                </motion.div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ━━━ FINAL CTA ━━━ */}
      <section className="relative py-40 overflow-hidden">
        {/* Massive background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/[0.08] rounded-full blur-[200px] pointer-events-none" />
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative max-w-4xl mx-auto px-6 text-center z-10">
          <RevealSection>
            <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight font-satoshi leading-[0.95] mb-8">
              Build With
              <span className="block bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                Spark
              </span>
            </h2>
            <p className="text-xl text-neutral-400 mb-12 font-geist">
              Let's launch something real.
            </p>
            <a
              href="https://t.me/Mathis_btc"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center justify-center px-10 py-4 bg-white text-black font-bold text-base rounded-xl overflow-hidden transition-all hover:shadow-2xl hover:shadow-white/10 font-satoshi"
            >
              <span className="relative z-10 flex items-center gap-2.5">
                Apply Now
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-orange-100 to-amber-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </a>
          </RevealSection>
        </div>
      </section>

      {/* ━━━ FOOTER ━━━ */}
      <footer className="border-t border-white/[0.04] bg-black/50 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img src="/sparklogo.png" alt="Spark" className="h-6 w-auto" />
          </div>
          <div className="text-[11px] text-neutral-600 font-satoshi">
            &copy; 2025 Spark Ecosystem. All rights reserved.
          </div>
          <div className="flex gap-5">
            <a href="https://x.com/JustSparkdotFun" target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:text-white transition-colors duration-300">
              <Twitter className="w-4 h-4" />
            </a>
            <a href="https://t.me/sparkdotfun" target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:text-white transition-colors duration-300">
              <Send className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
