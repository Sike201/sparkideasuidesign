import { Link } from "react-router-dom";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { ROUTES } from "@/utils/routes";

const steps = [
  {
    n: "01",
    title: "Discover and back",
    body: "Ideas ship with a funding goal. You allocate USDC to the ones you believe in. If the goal is missed, capital is returned.",
  },
  {
    n: "02",
    title: "Goal reached → token",
    body: "After the window closes, the idea mints into markets with treasury-backed structure — liquidity and runway are explicit, not hand-wavy.",
  },
  {
    n: "03",
    title: "Hackathon, market-chosen builder",
    body: "Teams propose plans and budgets. A decision market surfaces who the crowd expects to ship the most value. Payouts follow milestones.",
  },
  {
    n: "04",
    title: "Treasury and exits",
    body: "Capital stays traceable on-chain. Some funded ideas add a redemption vault later so holders can exit against USDG — see Funded → Graveyard.",
  },
] as const;

export function ExplanationView() {
  return (
    <div>
      <header className="mb-12 md:mb-16">
        <p className="font-geist-mono text-[11px] uppercase tracking-[0.3em] text-orange-400/90">Guide</p>
        <h1 className="mt-3 font-satoshi text-[26px] font-semibold tracking-tight text-white sm:text-[28px]">How Spark works</h1>
        <p className="mt-4 max-w-md text-[12px] leading-relaxed text-neutral-500 font-geist sm:text-[13px]">
          A straight line from post → fund → ship. No committees picking winners — markets and milestones do the work.
        </p>
      </header>

      <ol className="space-y-12 border-t border-white/[0.06] pt-12 md:space-y-14 md:pt-14">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-6 sm:gap-10">
            <span className="shrink-0 font-geist-mono text-[11px] text-orange-400/90">{s.n}</span>
            <div>
              <h2 className="font-satoshi text-[15px] font-semibold tracking-tight text-white sm:text-[16px]">{s.title}</h2>
              <p className="mt-3 text-[12px] leading-relaxed text-neutral-500 font-geist sm:text-[13px]">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-16 flex flex-col gap-2 sm:mt-20 sm:flex-row sm:items-center sm:gap-3">
        <Link
          to={ROUTES.IDEAS}
          className="inline-flex items-center justify-center gap-2 bg-orange-500 px-5 py-2.5 text-[12px] font-semibold text-black transition-colors hover:bg-orange-400 font-geist sm:px-6 sm:py-3 sm:text-[13px]"
        >
          Open feed
          <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.5} />
        </Link>
        <Link
          to={`${ROUTES.IDEAS}?submit=1`}
          className="inline-flex items-center justify-center px-5 py-2.5 text-[12px] font-medium text-white transition-colors hover:text-orange-400 font-geist sm:px-6 sm:py-3 sm:text-[13px]"
        >
          Post an idea
        </Link>
        <a
          href="https://justspark.notion.site/spark-doc-public"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-2 py-2.5 text-[12px] text-neutral-500 transition-colors hover:text-white font-geist sm:ml-auto sm:py-3 sm:text-[13px]"
        >
          Full docs
          <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.5} />
        </a>
      </div>
    </div>
  );
}

export default ExplanationView;
