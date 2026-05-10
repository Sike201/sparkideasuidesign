import { useRef, useEffect, useState } from "react";

interface AsciiBoxProps {
  title?: string;
  titleColor?: "orange" | "green" | "default";
  rightLabel?: string;
  children: React.ReactNode;
  className?: string;
}

const TITLE_COLORS = {
  orange: "text-[#F25C05]",
  green: "text-[#75E0A7]",
  default: "text-[#B0B3B8]",
};

export function AsciiBox({
  title,
  titleColor = "default",
  rightLabel,
  children,
  className = "",
}: AsciiBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [charWidth, setCharWidth] = useState(60);

  useEffect(() => {
    if (!boxRef.current) return;
    const measure = () => {
      const w = boxRef.current!.offsetWidth;
      // Approximate mono chars that fit (each ~8.4px at 14px font)
      setCharWidth(Math.floor(w / 8.4));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  const titleStr = title ? ` ${title} ` : "";
  const rightStr = rightLabel ? ` ${rightLabel} ` : "";
  const fillLen = Math.max(
    0,
    charWidth - 4 - titleStr.length - rightStr.length
  );
  const fill = "─".repeat(fillLen);

  const bottomFill = "─".repeat(Math.max(0, charWidth - 2));

  return (
    <div ref={boxRef} className={`font-mono text-xs ${className}`}>
      {/* Top border */}
      <div className="text-[#444B57] whitespace-nowrap overflow-hidden select-none">
        <span>┌───</span>
        {title && (
          <span className={TITLE_COLORS[titleColor]}>{titleStr}</span>
        )}
        <span className="text-[#444B57]">{fill}</span>
        {rightLabel && (
          <span className="text-[#A0A3A9]">{rightStr}</span>
        )}
        <span>┐</span>
      </div>

      {/* Content with side borders */}
      <div className="border-l border-r border-[#444B57] bg-[#0B0F19] px-4 py-3">
        {children}
      </div>

      {/* Bottom border */}
      <div className="text-[#444B57] whitespace-nowrap overflow-hidden select-none">
        <span>└{bottomFill}┘</span>
      </div>
    </div>
  );
}

export function SectionDivider() {
  return (
    <div className="text-[#444B57] text-xs font-mono text-center py-6 select-none">
      {"// ──────────────────────────────────────────────────────────── //"}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { dot: string; text: string }> = {
    open: { dot: "text-[#75E0A7]", text: "OPEN" },
    voting: { dot: "text-[#F25C05]", text: "VOTING" },
    completed: { dot: "text-[#A0A3A9]", text: "COMPLETED" },
    upcoming: { dot: "text-[#F29F04]", text: "UPCOMING" },
  };
  const c = cfg[status] || cfg.completed;

  return (
    <span className={`text-[10px] font-mono flex items-center gap-1.5 ${c.dot}`}>
      {status === "open" ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${c.dot === "text-[#75E0A7]" ? "bg-[#75E0A7]" : ""}`} />
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${c.dot === "text-[#75E0A7]" ? "bg-[#75E0A7]" : ""}`} />
        </span>
      ) : (
        <span>●</span>
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
    <span className="font-mono text-[10px]">
      <span className="text-[#F25C05]">{"▓".repeat(filled)}</span>
      <span className="text-[#2A3040]">{"░".repeat(empty)}</span>
    </span>
  );
}
