type FundIdeaLabelProps = {
  className?: string;
};

/** Decorative CTA for hot-ideas cards — card handles navigation. */
export function FundIdeaLabel({ className = "" }: FundIdeaLabelProps) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none relative inline-flex items-center justify-center overflow-hidden rounded-full border border-orange-500/45 px-5 py-2.5 font-geist text-[13px] font-semibold tracking-tight text-white sm:px-6 sm:py-3 sm:text-sm ${className}`}
    >
      <span className="absolute inset-0 origin-left scale-x-0 bg-orange-500 transition-transform duration-300 ease-out group-hover:scale-x-100" />
      <span className="relative z-[1] transition-colors duration-300 group-hover:text-black">
        Fund this idea
      </span>
    </span>
  );
}
