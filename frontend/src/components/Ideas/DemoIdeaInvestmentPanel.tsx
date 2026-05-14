import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import type { Idea } from "./types";

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Static investment card for `demo-*` ideas (no on-chain vault). */
export function DemoIdeaInvestmentPanel({ idea }: { idea: Idea }) {
  const [currency, setCurrency] = useState<"USDC" | "USDG">("USDC");
  const goal = idea.estimatedPrice ?? 0;
  const raised = idea.raisedAmount ?? 0;
  const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const investors = 0;

  return (
    <div className="rounded-none border-0 bg-transparent p-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" strokeWidth={2} />
          <span className="font-satoshi text-xs font-bold text-white">Investment opened</span>
        </div>
        <span className="font-geist-mono text-[9px] uppercase tracking-wider text-neutral-600">Preview</span>
      </div>

      <div className="mb-3 h-1 overflow-hidden rounded-none bg-white/[0.08]">
        <motion.div
          className="h-full rounded-none bg-gradient-to-r from-emerald-600 to-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.85, ease: easeOut }}
        />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-geist-mono text-[9px] uppercase tracking-wider text-neutral-600">Raised</p>
          <p className="mt-0.5 font-geist-mono text-xs font-semibold tabular-nums text-white">
            ${raised.toLocaleString("en-US")}
          </p>
        </div>
        <div>
          <p className="font-geist-mono text-[9px] uppercase tracking-wider text-neutral-600">Goal</p>
          <p className="mt-0.5 font-geist-mono text-xs font-semibold tabular-nums text-white">
            ${goal.toLocaleString("en-US")}
          </p>
        </div>
        <div>
          <p className="font-geist-mono text-[9px] uppercase tracking-wider text-neutral-600">Investors</p>
          <p className="mt-0.5 font-geist-mono text-xs font-semibold tabular-nums text-white">{investors}</p>
        </div>
      </div>

      <p className="mb-3 text-center font-geist-mono text-[11px] tabular-nums text-emerald-400/95">{pct.toFixed(1)}%</p>

      <div className="mb-3 flex gap-2 rounded-none border border-white/[0.1] bg-transparent p-0.5">
        <button
          type="button"
          onClick={() => setCurrency("USDC")}
          className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-none py-2.5 text-[11px] font-satoshi font-medium transition-colors ${
            currency === "USDC"
              ? "bg-white/[0.1] text-white"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <img src="/usdc.png" alt="" className="h-4 w-4 shrink-0 rounded-none" aria-hidden />
          <span>USDC</span>
        </button>
        <button
          type="button"
          onClick={() => setCurrency("USDG")}
          className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-none py-2.5 text-[11px] font-satoshi font-medium transition-colors ${
            currency === "USDG"
              ? "bg-white/[0.1] text-white"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <img src="/usdg.png" alt="" className="h-4 w-4 shrink-0 rounded-none" aria-hidden />
          <span>USDG</span>
        </button>
      </div>

      <button
        type="button"
        disabled
        className="w-full rounded-none bg-emerald-500 py-3 font-satoshi text-xs font-bold text-black opacity-80"
        title="Preview — connect on a live raise to invest"
      >
        Invest now ({currency})
      </button>
      <p className="mt-2 text-center font-geist text-[10px] leading-relaxed text-neutral-600">
        Figures illustrative. Live raises use on-chain vaults.
      </p>
    </div>
  );
}
