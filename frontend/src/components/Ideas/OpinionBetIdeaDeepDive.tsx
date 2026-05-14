import type { Idea } from "./types";

/** Dense on-page brief for the Opinion Bet demo — mirrors landing narrative without a separate route. */
export function OpinionBetIdeaDeepDive({ idea }: { idea: Idea }) {
  const goal = idea.estimatedPrice ?? 0;
  const raised = idea.raisedAmount ?? 0;
  const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const liq = idea.liquidityPercent ?? 0.2;
  const treasuryPct = 1 - liq;

  return (
    <div className="mb-0 space-y-0 border-0 bg-transparent text-neutral-200">
      <div className="border-b border-white/[0.1] bg-transparent px-0 py-3 md:py-4">
        <p className="font-geist-mono text-[10px] uppercase tracking-[0.35em] text-orange-400/90">Idea dossier · consumer</p>
        <h2 className="mt-2 font-satoshi text-lg font-semibold tracking-tight text-white md:text-xl">
          Opinion markets for posts — tickets, odds, moderated threads, on-chain receipts.
        </h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-neutral-400 md:text-[14px]">
          Put capital behind viewpoints, keep settlement legible, and route rewards to the side that resolves correctly. Built for feeds that
          already move fast — Solana rails keep participation small-ticket and auditable.
        </p>
      </div>

      <div className="grid grid-cols-2 border-b border-white/[0.08] md:grid-cols-4">
        {[
          { k: "Raise progress", v: `${pct.toFixed(1)}%` },
          { k: "Soft target", v: goal ? `$${goal.toLocaleString("en-US")}` : "—" },
          { k: "Ticketed", v: `$${raised.toLocaleString("en-US")}` },
          { k: "Ticker", v: idea.ticker ? `$${idea.ticker}` : "—" },
        ].map((row) => (
          <div key={row.k} className="border-b border-white/[0.06] bg-transparent px-0 py-3 last:border-b-0 md:border-b-0 md:border-r md:border-white/[0.06] md:last:border-r-0">
            <p className="font-geist-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500">{row.k}</p>
            <p className="mt-1 font-geist-mono text-sm tabular-nums text-white">{row.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-0 border-b border-white/[0.08] md:grid-cols-2">
        <section className="border-b border-white/[0.06] py-5 md:border-b-0 md:border-r md:border-white/[0.06]">
          <h3 className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">Problem</h3>
          <p className="mt-2 text-[13px] leading-[1.65] text-neutral-300 md:text-[14px]">
            Discussions reward volume, not conviction. Without stakes, debates flatten — there is no durable signal on who actually believed
            what, and no clean way to reward people who were right ex post.
          </p>
        </section>
        <section className="py-5">
          <h3 className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">Solution</h3>
          <p className="mt-2 text-[13px] leading-[1.65] text-neutral-300 md:text-[14px]">
            Opinion Bet turns threads into micro-markets: creators post a proposition, backers buy tickets on sides they believe in, agents keep
            moderation tight, and settlement pays winners pro-rata. Every position is an on-chain receipt — portable, queryable, and easier to
            audit than off-platform screenshots.
          </p>
        </section>
      </div>

      <section className="border-b border-white/[0.08] py-5">
        <h3 className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">How it works</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13px] leading-[1.65] text-neutral-300 md:text-[14px]">
          <li>Creator publishes a time-bound claim; pool opens in USDC / USDG with transparent fee skim to the vault.</li>
          <li>Participants buy into the side they defend; odds move as flow shifts so conviction is continuously priced.</li>
          <li>Moderation layer keeps bad-faith flooding in check; resolution rules are explicit before tickets close.</li>
          <li>After resolution, payouts route to winners; losing inventory is burned or redistributed per policy — all legible on-chain.</li>
        </ol>
      </section>

      <div className="grid gap-0 md:grid-cols-3">
        {[
          { t: "Live tickets", d: "Sub-$5 participation tuned for mobile — fast fills, clear caps, no hidden leverage." },
          { t: "Moderated arenas", d: "Agents + policy bundles keep debates on-rails; disputes surface before money moves." },
          { t: "Dynamic odds", d: "Flow reprices sides in real time; late information pays if it arrives before the window." },
        ].map((c, i) => (
          <div
            key={c.t}
            className={`border-b border-white/[0.06] py-4 md:border-b-0 md:py-5 ${i < 2 ? "md:border-r md:border-white/[0.06]" : ""}`}
          >
            <p className="font-satoshi text-sm font-semibold text-white">{c.t}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">{c.d}</p>
          </div>
        ))}
      </div>

      <section className="border-b border-white/[0.08] py-5">
        <h3 className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">Why now</h3>
        <p className="mt-2 text-[13px] leading-[1.65] text-neutral-300 md:text-[14px]">
          On-chain prediction liquidity crossed a threshold, but retail UX is still broker-grade. Cheap fees + wallet-native flows make
          opinion markets viable inside social products — not only as standalone venues — and teams want receipts, not vibes.
        </p>
      </section>

      <div className="grid gap-0 md:grid-cols-2">
        <section className="border-b border-white/[0.06] py-5 md:border-b-0 md:border-r md:border-white/[0.06]">
          <h3 className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">Launch economics (illustrative)</h3>
          <dl className="mt-3 space-y-2 font-geist-mono text-[12px] text-neutral-400">
            <div className="flex justify-between gap-4 border-b border-white/[0.05] py-1.5">
              <dt>Launch print</dt>
              <dd className="tabular-nums text-white">{idea.initialTokenPrice != null ? `$${idea.initialTokenPrice.toFixed(6)}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/[0.05] py-1.5">
              <dt>Treasury allocation</dt>
              <dd className="tabular-nums text-emerald-400/90">{Math.round(treasuryPct * 100)}%</dd>
            </div>
            <div className="flex justify-between gap-4 py-1.5">
              <dt>Liquidity allocation</dt>
              <dd className="tabular-nums text-emerald-400/90">{Math.round(liq * 100)}%</dd>
            </div>
          </dl>
        </section>
        <section className="py-5">
          <h3 className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">Risks & posture</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-neutral-500">
            <li>Skill vs. chance treatment varies materially by jurisdiction — product copy and geofencing must track counsel.</li>
            <li>Oracle / resolution quality is the brand — ambiguous rules will torch trust faster than any exploit.</li>
            <li>Moderation at scale is expensive; fee skim must cover ops without punishing honest participants.</li>
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-transparent px-0 py-3 md:py-4">
        <p className="font-geist-mono text-[10px] uppercase tracking-[0.22em] text-neutral-600">
          Public preview · figures illustrative · vault path matches live raises
        </p>
        <p className="font-geist-mono text-[10px] text-neutral-600">
          @{idea.authorUsername} · {idea.coinName ?? idea.title}
        </p>
      </div>
    </div>
  );
}
