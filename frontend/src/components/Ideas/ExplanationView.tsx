import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import {
  Lightbulb,
  Rocket,
  Users,
  Shield,
  ArrowRight,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "../../utils/sparkUtils";

const steps = [
  {
    number: 1,
    icon: Lightbulb,
    title: "Discover & Back Ideas",
    subtitle: "Browse and invest in ideas you believe in",
    description:
      "Ideas are submitted by the community. Each has a funding goal. Invest USDC to back the ones you believe in. If the goal isn't reached, you get your funds back.",
    gradient: "from-orange-500/20 to-orange-600/5",
    border: "border-orange-500/20 hover:border-orange-500/40",
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-400",
    numberBg: "bg-gradient-to-br from-orange-500 to-orange-600",
    glowColor: "rgba(249, 115, 22, 0.15)",
  },
  {
    number: 2,
    icon: Rocket,
    title: "Funding Goal Reached",
    subtitle: "Your investment becomes liquid",
    description:
      "Once the funding goal is hit, a 72h window opens for late investors. Then the token launches: 20% in LP, 80% in treasury — backed by real assets.",
    gradient: "from-emerald-500/20 to-emerald-600/5",
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
    numberBg: "bg-gradient-to-br from-emerald-500 to-emerald-600",
    glowColor: "rgba(16, 185, 129, 0.15)",
  },
  {
    number: 3,
    icon: Users,
    title: "Hackathon — Market Decides",
    subtitle: "Teams compete, the market chooses",
    description:
      "Teams submit their plan + budget to build the project. A market-based mechanism selects the optimal team. Payment released in milestones.",
    gradient: "from-purple-500/20 to-purple-600/5",
    border: "border-purple-500/20 hover:border-purple-500/40",
    iconBg: "bg-purple-500/15",
    iconColor: "text-purple-400",
    numberBg: "bg-gradient-to-br from-purple-500 to-purple-600",
    glowColor: "rgba(168, 85, 247, 0.15)",
  },
  {
    number: 4,
    icon: Shield,
    title: "Investment Protected",
    subtitle: "Full backing, full transparency",
    description:
      "Before a team is selected, 100% of funds stay in treasury. Even after, the token remains backed. If the project fails, value doesn't go to zero.",
    gradient: "from-cyan-500/20 to-cyan-600/5",
    border: "border-cyan-500/20 hover:border-cyan-500/40",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-400",
    numberBg: "bg-gradient-to-br from-cyan-500 to-cyan-600",
    glowColor: "rgba(6, 182, 212, 0.15)",
  },
];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

export function ExplanationView() {
  return (
    <div className="relative overflow-hidden">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[400px] w-[700px] rounded-full bg-orange-500/[0.07] blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[250px] w-[350px] rounded-full bg-purple-500/[0.05] blur-[100px]" />
        <div className="absolute bottom-1/4 right-0 h-[250px] w-[350px] rounded-full bg-emerald-500/[0.05] blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-8 sm:px-10 lg:px-16">
        {/* Header */}
        <motion.div
          className="mb-8 text-center"
          initial="hidden"
          animate="visible"
          variants={headerVariants}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/5 px-3 py-1 text-xs font-medium font-satoshi text-orange-400">
            <Sparkles className="h-3 w-3" />
            How it works
          </div>

          <h1 className="mb-2 text-3xl font-black font-satoshi tracking-tight text-white md:text-4xl">
            From Idea to{" "}
            <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              Reality
            </span>
          </h1>

          <p className="mx-auto max-w-lg text-sm font-geist leading-relaxed text-neutral-400 md:text-base">
            A community-driven journey where great ideas get funded, built, and
            launched — with your investment protected every step of the way.
          </p>
        </motion.div>

        {/* Cards Grid - 2x2 */}
        <motion.div
          className="grid gap-5 md:grid-cols-2"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                variants={itemVariants}
                className="group relative"
              >
                <div
                  className={cn(
                    "relative h-full rounded-2xl border bg-white/[0.02] backdrop-blur-sm transition-all duration-300",
                    "hover:bg-white/[0.04]",
                    step.border
                  )}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 8px 40px -12px ${step.glowColor}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Gradient overlay on hover */}
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100",
                      step.gradient
                    )}
                  />

                  <div className="relative z-10 flex items-start gap-4 p-6">
                    {/* Number + Icon */}
                    <div className="flex shrink-0 flex-col items-center gap-2">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold font-satoshi text-white shadow-lg",
                          step.numberBg
                        )}
                      >
                        {step.number}
                      </div>
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md",
                          step.iconBg
                        )}
                      >
                        <Icon
                          className={cn("h-4 w-4", step.iconColor)}
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-0.5 text-base font-satoshi font-bold text-white">
                        {step.title}
                      </h3>
                      <p className="mb-2 text-xs font-medium font-satoshi text-neutral-500">
                        {step.subtitle}
                      </p>
                      <p className="text-sm font-geist leading-relaxed text-neutral-300">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* CTA */}
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/ideas"
              className="shiny-button inline-flex items-center gap-2.5 rounded-xl px-8 py-3 text-sm font-satoshi font-bold text-white transition-all duration-300 hover:scale-[1.03] hover:shadow-lg hover:shadow-orange-500/25"
            >
              Explore Ideas
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://justspark.notion.site/spark-doc-public"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-8 py-3 text-sm font-satoshi font-bold text-neutral-300 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white"
            >
              Read the Docs
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default ExplanationView;
