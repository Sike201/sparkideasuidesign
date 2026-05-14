import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import { motion } from "framer-motion";
import { SEO } from "@/components/SEO";
import { CONTRACT_ADDRESS } from "@/utils/sparkUtils";
import { ROUTES } from "@/utils/routes";
import Aurora from "@/components/Aurora";

const ORANGE = "#f97316";

/** WebGL aurora — flipped so intensity reads from the bottom; warm orange ramp. */
const AURORA_STOPS = ["#431407", "#ea580c", "#fdba74"];

/** Visual weight in the marquee — default matches the majority of partner marks. */
const PARTNER_LOGO_SCALE = {
  sm: "h-6 max-h-6 max-w-[104px]",
  md: "h-7 max-h-7 max-w-[120px]",
  lg: "h-9 max-h-9 max-w-[152px]",
} as const;

type PartnerLogoScale = keyof typeof PARTNER_LOGO_SCALE;

/** Partner marks — local assets ship with the repo; remote logos stay on CDN. */
const PARTNER_LOGOS: {
  src: string;
  alt: string;
  logoWhite?: boolean;
  scale?: PartnerLogoScale;
}[] = [
  { src: "/brand-mark.png", alt: "Just Spark" },
  { src: "https://justspark.fun/vnx.png", alt: "VNX" },
  { src: "https://justspark.fun/zerospread.png", alt: "ZeroSpread" },
  { src: "/omnipair.png", alt: "Omnipair", logoWhite: true, scale: "lg" },
  {
    src: "https://www.combinator.trade/combinator-icon.svg",
    alt: "Combinator",
    scale: "lg",
  },
  { src: "https://justspark.fun/usdg.png", alt: "Global Dollar Network" },
  { src: "/sparklogo.png", alt: "Spark", scale: "sm" },
];

const easeOut = [0.22, 1, 0.36, 1] as const;

const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.06 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: easeOut },
  },
};

function PartnerMarquee() {
  const loop = [...PARTNER_LOGOS, ...PARTNER_LOGOS];
  const edgeMask = "linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%)";
  return (
    <div className="relative mt-10 w-full select-none py-2">
      <div
        className="overflow-hidden"
        style={{
          WebkitMaskImage: edgeMask,
          maskImage: edgeMask,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }}
      >
        <div className="flex w-max animate-marquee items-center gap-14 md:gap-20 will-change-transform">
          {loop.map((p, i) => (
            <img
              key={`${p.alt}-${i}`}
              src={p.src}
              alt=""
              loading="lazy"
              decoding="async"
              className={[
                "w-auto object-contain opacity-[0.38] transition duration-500 hover:opacity-70",
                PARTNER_LOGO_SCALE[p.scale ?? "md"],
                p.logoWhite ? "brightness-0 invert" : "grayscale",
              ].join(" ")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPageV2() {
  const [copied, setCopied] = useState(false);

  const copyCa = () => {
    void navigator.clipboard.writeText(CONTRACT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen bg-black text-neutral-400 antialiased selection:bg-orange-500/20 selection:text-orange-200">
      <SEO path="/" />

      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="h-full w-full origin-center -scale-y-100 opacity-[0.55]">
          <Aurora colorStops={AURORA_STOPS} amplitude={1} blend={0.5} />
        </div>
        </div>

      <div className="relative z-10">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: easeOut }}
          className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-10 font-geist text-[13px]"
        >
          <Link
            to={ROUTES.LANDING_PAGE}
            className="text-neutral-500 transition-colors duration-300 hover:text-white"
          >
            Spark
          </Link>
          <nav className="flex flex-wrap justify-end gap-x-6 gap-y-2">
            <Link to={ROUTES.IDEAS} className="text-neutral-500 transition-colors duration-300 hover:text-white">
              Ideas
            </Link>
            <Link to={ROUTES.HACKATHONS} className="text-neutral-500 transition-colors duration-300 hover:text-white">
              Hackathons
            </Link>
            <Link to={ROUTES.BUILDERS} className="text-neutral-500 transition-colors duration-300 hover:text-white">
              Builders
            </Link>
            <a
              href={ROUTES.DOCS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 transition-colors duration-300 hover:text-white"
            >
              Docs
            </a>
          </nav>
        </motion.header>

        <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col justify-center px-6 pb-24 pt-16 md:min-h-[calc(100vh-10rem)] md:pt-8">
          <motion.div variants={stagger} initial="hidden" animate="show" className="flex w-full flex-col">
            <motion.p variants={fadeUp} className="font-geist-mono text-[11px] uppercase tracking-[0.32em]" style={{ color: ORANGE }}>
              Idea launchpad on Solana
            </motion.p>

            <motion.h1
              variants={fadeUp}
              className="mt-8 font-satoshi text-[clamp(2rem,5.5vw,3.25rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-white"
            >
              Fund the idea first.
              <br />
              <span style={{ color: ORANGE }}>Find the builder second.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="mt-8 max-w-xl text-[15px] leading-relaxed text-neutral-500 font-geist">
              On{" "}
              <a
                href="https://justspark.fun/"
                className="text-neutral-300 underline-offset-4 transition-colors duration-300 hover:text-orange-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                JustSpark
              </a>
              , ideas raise in USDC and markets pick who builds—not a committee. Ideators earn from trading fees; builders earn the winning proposal; funders can recover capital if the raise fails or no builder wins.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-14 flex flex-wrap items-center gap-3">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 450, damping: 22 }}>
                <Link
                  to={ROUTES.IDEAS}
                  className="inline-flex min-h-[44px] items-center justify-center bg-orange-500 px-8 py-3 text-[13px] font-semibold text-black transition-colors duration-300 hover:bg-orange-400 font-geist"
                >
                  Explore ideas
                </Link>
          </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 450, damping: 22 }}>
                <a
                  href="https://t.me/sparkdotfun"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center px-5 py-3 text-[12px] font-medium text-neutral-300 transition-colors duration-300 hover:text-white font-geist"
                >
                  Build with us
                </a>
              </motion.div>
            </motion.div>

            <motion.p
              variants={fadeUp}
              className="mt-16 text-[12px] leading-relaxed text-neutral-600 font-geist"
            >
              New here?{" "}
              <Link to={ROUTES.EXPLANATION} className="text-neutral-400 underline-offset-4 transition-colors duration-300 hover:text-orange-400 hover:underline">
                How it works
                  </Link>
              {" · "}
              <Link to={ROUTES.FUNDED} className="text-neutral-400 underline-offset-4 transition-colors duration-300 hover:text-orange-400 hover:underline">
                Funded ideas
            </Link>
              {" · "}
              <a
                href="https://justspark.fun/ideas"
                    target="_blank"
                    rel="noopener noreferrer"
                className="text-neutral-400 underline-offset-4 transition-colors duration-300 hover:text-orange-400 hover:underline"
              >
                Live ideas
              </a>
            </motion.p>

            <motion.div variants={fadeUp} className="w-full">
              <PartnerMarquee />
            </motion.div>
          </motion.div>
        </main>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.5, ease: easeOut }}
          className="mx-auto max-w-3xl px-6 pb-12 font-geist text-[12px] text-neutral-600"
        >
          <div className="flex flex-col gap-6 pt-8 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a
                href="https://github.com/EwanBorgPad/spark-public"
                    target="_blank"
                    rel="noopener noreferrer"
                className="transition-colors duration-300 hover:text-orange-400"
              >
                Source
              </a>
              <a href="https://x.com/JustSparkIdeas" target="_blank" rel="noopener noreferrer" className="transition-colors duration-300 hover:text-orange-400">
                X
              </a>
              <a href="https://t.me/sparkdotfun" target="_blank" rel="noopener noreferrer" className="transition-colors duration-300 hover:text-orange-400">
                    Telegram
                  </a>
              <Link to={ROUTES.TERMS} className="transition-colors duration-300 hover:text-orange-400">
                Terms
              </Link>
              <Link to={ROUTES.PRIVACY} className="transition-colors duration-300 hover:text-orange-400">
                Privacy
              </Link>
                </div>
            <motion.button
              type="button"
              onClick={copyCa}
              whileHover={{ opacity: 1 }}
              className="flex max-w-full items-center gap-2 text-left font-geist-mono text-[11px] text-neutral-500 opacity-90 transition-colors duration-300 hover:text-orange-400"
            >
              <span className="truncate">{CONTRACT_ADDRESS}</span>
              <Copy className="h-3.5 w-3.5 shrink-0 opacity-60" />
              {copied ? <span className="shrink-0 text-orange-400">Copied</span> : null}
            </motion.button>
          </div>
        </motion.footer>
        </div>
    </div>
  );
}
