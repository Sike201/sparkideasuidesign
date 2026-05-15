import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import IdeasLayout from "@/components/Ideas/IdeasLayout";
import Aurora from "@/components/Aurora";
import { SEO } from "@/components/SEO";
import { ROUTES } from "@/utils/routes";
import { getMockFundedBySlug, mockProgressPct } from "@/data/mockFundedPortfolio";

const AURORA_STOPS = ["#431407", "#ea580c", "#fdba74"];
const easeOut = [0.22, 1, 0.36, 1] as const;

function fmtUsdFull(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function FundedMockDetailPage() {
  const { slug } = useParams();
  const project = getMockFundedBySlug(slug);
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);

  if (!project) {
    return (
      <IdeasLayout auth={auth} ideasData={ideasData}>
        <div className="relative">
          <div className="pointer-events-none fixed inset-0 z-0 bg-black">
            <div className="h-full w-full origin-center -scale-y-100 opacity-[0.32]">
              <Aurora colorStops={AURORA_STOPS} amplitude={1} blend={0.5} />
            </div>
          </div>
          <div className="relative z-10 py-24 text-center">
            <p className="font-geist text-[13px] text-neutral-500">This portfolio memo was not found.</p>
            <Link to={ROUTES.FUNDED} className="mt-4 inline-block font-geist text-[13px] text-orange-400 hover:underline">
              Back to funded
            </Link>
          </div>
        </div>
      </IdeasLayout>
    );
  }

  const pct = mockProgressPct(project);

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      <SEO title={`${project.title} · Funded`} description={project.tagline} path={`/funded/mock/${project.slug}`} />

      <div className="relative">
        <div className="pointer-events-none fixed inset-0 z-0 bg-black">
          <div className="h-full w-full origin-center -scale-y-100 opacity-[0.38]">
            <Aurora colorStops={AURORA_STOPS} amplitude={1} blend={0.5} />
          </div>
        </div>

        <div className="relative z-10 animate-ideas-content-in">
          <Link
            to={ROUTES.FUNDED}
            className="mb-8 inline-flex items-center gap-2 font-geist text-[12px] text-neutral-500 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Portfolio
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="overflow-hidden border border-white/[0.08] bg-black/80 backdrop-blur-sm"
          >
            <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="relative aspect-[5/4] min-h-[220px] bg-neutral-950 lg:aspect-auto lg:min-h-[420px]">
                <motion.img
                  src={project.image}
                  alt=""
                  className="h-full w-full object-cover"
                  initial={{ scale: 1.06 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.85, ease: easeOut }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8">
                  <p className="font-geist-mono text-[10px] uppercase tracking-[0.35em] text-orange-400/95">
                    {project.status === "graveyard" ? "Archive" : "Active mandate"}
                  </p>
                  <h1 className="mt-2 font-satoshi text-[clamp(1.5rem,4vw,2.25rem)] font-semibold tracking-tight text-white">
                    {project.title}
                  </h1>
                  <p className="mt-2 max-w-xl font-geist text-[13px] leading-relaxed text-neutral-400">{project.tagline}</p>
                </div>
              </div>

              <div className="border-t border-white/[0.06] p-6 lg:border-l lg:border-t-0 lg:p-10">
                <dl className="space-y-5 font-geist">
                  <div className="flex justify-between gap-6 border-b border-white/[0.06] pb-4">
                    <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-600">Committed</dt>
                    <dd className="text-right font-geist-mono text-[14px] tabular-nums text-white">{fmtUsdFull(project.raisedUsd)}</dd>
                  </div>
                  <div className="flex justify-between gap-6 border-b border-white/[0.06] pb-4">
                    <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-600">Minimum raise</dt>
                    <dd className="text-right font-geist-mono text-[14px] tabular-nums text-neutral-300">{fmtUsdFull(project.goalUsd)}</dd>
                  </div>
                  <div className="flex justify-between gap-6 border-b border-white/[0.06] pb-4">
                    <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-600">Progress</dt>
                    <dd className="text-right font-geist-mono text-[14px] tabular-nums text-orange-300/95">{pct}%</dd>
                  </div>
                  <div className="flex justify-between gap-6 pb-1">
                    <dt className="text-[11px] uppercase tracking-[0.2em] text-neutral-600">Sector</dt>
                    <dd className="text-right text-[13px] text-neutral-300">{project.category}</dd>
                  </div>
                </dl>

                <div className="mt-8">
                  <p className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-600">Thesis</p>
                  <p className="mt-3 font-geist text-[13px] leading-relaxed text-neutral-400">{project.thesis}</p>
                </div>

                {project.footnote ? (
                  <p className="mt-8 border-t border-white/[0.06] pt-6 font-geist text-[12px] leading-relaxed text-neutral-500">
                    {project.footnote}
                  </p>
                ) : null}

                <p className="mt-10 font-geist-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
                  Design preview · figures illustrative
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </IdeasLayout>
  );
}
