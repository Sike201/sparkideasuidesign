import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

export type WalletProfile = {
  username: string;
  display_name?: string;
  avatar_url?: string;
  twitter_url?: string;
  telegram_url?: string;
  github_url?: string;
};

interface WalletProfileBadgeProps {
  wallet: string;
  profile?: WalletProfile;
  /** Text shown when profile has no username (fallback = truncated wallet). */
  fallbackLabel: string;
  /** Optional suffix (e.g. " (you)"). Non-clickable. */
  suffix?: string;
  /** Tailwind class for the label (color, weight). */
  className?: string;
}

/**
 * Renders a wallet display name. If a profile with socials exists, the label
 * becomes a button that toggles a small popover with X / Telegram / GitHub
 * links and a link to the full builder profile. Otherwise it's just a span.
 */
export default function WalletProfileBadge({
  wallet,
  profile,
  fallbackLabel,
  suffix,
  className = "",
}: WalletProfileBadgeProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const label = profile?.username || fallbackLabel;
  const hasProfile = !!profile?.username;
  const hasAnySocial = !!(profile?.twitter_url || profile?.telegram_url || profile?.github_url);

  if (!hasProfile) {
    return (
      <span className={className} title={wallet}>
        {label}{suffix}
      </span>
    );
  }

  return (
    <span ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${className} cursor-pointer hover:underline`}
        title={wallet}
      >
        {label}
      </button>
      {suffix && <span className={className}>{suffix}</span>}
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-56 border border-[#2A3040] bg-[#0C0D10] p-2.5 shadow-lg font-mono text-[11px]">
          <div className="flex items-center gap-2 mb-2">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full border border-[#2A3040]" />
            ) : (
              <div className="w-8 h-8 rounded-full border border-[#2A3040] bg-[#1A1D23] flex items-center justify-center text-[#A0A3A9] text-[10px] uppercase">
                {label.slice(0, 2)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[#F5F5F6] font-bold truncate">{profile.display_name || profile.username}</p>
              <p className="text-[#555E6B] text-[9px] truncate">@{profile.username}</p>
            </div>
          </div>

          <div className="text-[9px] text-[#555E6B] mb-1 break-all">
            {wallet.slice(0, 8)}...{wallet.slice(-8)}
          </div>

          {hasAnySocial && (
            <div className="flex flex-wrap gap-1 mb-2">
              {profile.twitter_url && (
                <a
                  href={profile.twitter_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 border border-[#2A3040] text-[#B0B3B8] hover:border-[#F25C05] hover:text-[#F25C05] transition-colors"
                  onClick={() => setOpen(false)}
                >
                  [X]
                </a>
              )}
              {profile.telegram_url && (
                <a
                  href={profile.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 border border-[#2A3040] text-[#B0B3B8] hover:border-[#F25C05] hover:text-[#F25C05] transition-colors"
                  onClick={() => setOpen(false)}
                >
                  [TG]
                </a>
              )}
              {profile.github_url && (
                <a
                  href={profile.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 border border-[#2A3040] text-[#B0B3B8] hover:border-[#F25C05] hover:text-[#F25C05] transition-colors"
                  onClick={() => setOpen(false)}
                >
                  [GH]
                </a>
              )}
            </div>
          )}

          <Link
            to={`/builders/${encodeURIComponent(profile.username)}`}
            className="block text-center py-1 border border-[#F25C05]/40 text-[#F25C05] hover:bg-[#F25C05]/10 transition-colors"
            onClick={() => setOpen(false)}
          >
            [→ view profile]
          </Link>
        </div>
      )}
    </span>
  );
}
