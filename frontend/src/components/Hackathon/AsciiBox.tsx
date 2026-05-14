/** Section chrome aligned with Ideas “dossier” pages — thin labels, transparent surfaces. */

const TITLE_COLORS = {
  orange: "text-orange-400/95",
  green: "text-emerald-400/90",
  default: "text-neutral-500",
};

interface AsciiBoxProps {
  title?: string;
  titleColor?: "orange" | "green" | "default";
  rightLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export function AsciiBox({
  title,
  titleColor = "default",
  rightLabel,
  children,
  className = "",
}: AsciiBoxProps) {
  return (
    <section className={`min-w-0 ${className}`}>
      {(title || rightLabel) && (
        <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
          {title ? (
            <h2
              className={`font-geist-mono text-[10px] font-medium uppercase tracking-[0.28em] ${TITLE_COLORS[titleColor]}`}
            >
              {title}
            </h2>
          ) : (
            <span />
          )}
          {rightLabel ? (
            <span className="shrink-0 font-geist-mono text-[10px] uppercase tracking-wider text-neutral-500">
              {rightLabel}
            </span>
          ) : null}
        </div>
      )}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SectionDivider() {
  return <div className="my-8 h-px w-full bg-white/[0.08]" aria-hidden />;
}

export function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { dot: string; text: string }> = {
    open: { dot: "text-emerald-400", text: "OPEN" },
    voting: { dot: "text-orange-400", text: "VOTING" },
    completed: { dot: "text-neutral-500", text: "COMPLETED" },
    upcoming: { dot: "text-amber-400", text: "UPCOMING" },
  };
  const c = cfg[status] || cfg.completed;

  return (
    <span className={`flex items-center gap-1.5 font-geist-mono text-[10px] ${c.dot}`}>
      {status === "open" ? (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${c.dot === "text-emerald-400" ? "bg-emerald-400" : ""}`}
          />
          <span
            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${c.dot === "text-emerald-400" ? "bg-emerald-400" : ""}`}
          />
        </span>
      ) : (
        <span aria-hidden>●</span>
      )}
      {c.text}
    </span>
  );
}

export function OddsBar({ odds }: { odds: number }) {
  const total = 20;
  const filled = Math.round(odds * total);
  const empty = total - filled;
  return (
    <span className="font-geist-mono text-[10px]">
      <span className="text-orange-500">{"▓".repeat(filled)}</span>
      <span className="text-white/[0.12]">{"░".repeat(empty)}</span>
    </span>
  );
}
