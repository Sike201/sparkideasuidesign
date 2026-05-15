import { motion } from "framer-motion";
import { fundingBarClass, fundingPctTextClass, getFundingTier } from "./fundingTier";

type IdeaFundingMeterProps = {
  goal: number;
  raised: number;
  ratio: number;
  variant?: "hot" | "feed";
  barWidthPct?: number;
  className?: string;
  animateBar?: boolean;
  animateDelay?: number;
};

export function IdeaFundingMeter({
  goal,
  raised,
  ratio,
  variant = "feed",
  barWidthPct,
  className = "",
  animateBar = false,
  animateDelay = 0,
}: IdeaFundingMeterProps) {
  const pct = goal > 0 ? Math.min(100, Math.round(ratio * 100)) : 0;
  const tier = getFundingTier(ratio);
  const barClass = fundingBarClass(tier);
  const accentClass = fundingPctTextClass(tier);
  const width = barWidthPct ?? pct;

  const amounts = (
    <span className={`tabular-nums ${accentClass}`}>
      ${raised.toLocaleString("en-US")}
      <span className="text-neutral-500"> / ${goal.toLocaleString("en-US")}</span>
    </span>
  );

  const statsRow = (
    <div
      className={`flex items-baseline justify-between gap-2 font-geist-mono text-[10px] tabular-nums sm:text-[11px] ${
        variant === "hot" ? "mt-2" : ""
      }`}
    >
      <span className={`font-medium ${accentClass}`}>{pct}%</span>
      {amounts}
    </div>
  );

  const barFill = animateBar ? (
    <motion.div
      className={`h-full rounded-none ${barClass}`}
      initial={{ width: 0 }}
      animate={{ width: `${width}%` }}
      transition={{ duration: 0.75, delay: animateDelay, ease: [0.22, 1, 0.36, 1] }}
    />
  ) : (
    <div className={`h-full rounded-none ${barClass}`} style={{ width: `${width}%` }} />
  );

  const bar = <div className="h-1 overflow-hidden rounded-none bg-white/[0.08]">{barFill}</div>;

  if (variant === "feed") {
    return (
      <div className={`space-y-1 ${className}`}>
        {bar}
        {statsRow}
      </div>
    );
  }

  return (
    <div className={className}>
      {bar}
      {statsRow}
    </div>
  );
}
