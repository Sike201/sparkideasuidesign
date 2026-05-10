import { useState } from "react";
import { X, Copy, Twitter, Check, ArrowUpRight } from "lucide-react";
import { Idea } from "./types";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  idea: Idea;
}

export function ShareModal({ isOpen, onClose, idea }: ShareModalProps) {
  const [linkCopied, setLinkCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const url = `${window.location.origin}/ideas/${idea.slug}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white font-satoshi">Share Idea</h3>
          <button onClick={onClose} className="text-neutral-600 hover:text-white transition-colors duration-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className={`w-full flex items-center gap-3 px-4 py-3.5 border rounded-xl transition-all duration-300 ${
              linkCopied
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05] hover:border-orange-500/20"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              linkCopied ? "bg-emerald-500/15" : "bg-white/[0.06]"
            }`}>
              {linkCopied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 text-neutral-300" />
              )}
            </div>
            <div className="text-left">
              <p className={`text-xs font-bold font-satoshi ${linkCopied ? "text-emerald-400" : "text-white"}`}>
                {linkCopied ? "Copied!" : "Copy Link"}
              </p>
              <p className="text-[10px] text-neutral-500 font-geist">
                {linkCopied ? "Link copied to clipboard" : "Copy the idea URL to clipboard"}
              </p>
            </div>
          </button>

          {/* Share on Twitter */}
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this idea: "${idea.title}"`)}&url=${encodeURIComponent(`${window.location.origin}/ideas/${idea.slug}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] hover:border-orange-500/20 transition-all duration-300"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Twitter className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-white font-satoshi">Share on X</p>
              <p className="text-[10px] text-neutral-500 font-geist">Share this idea on Twitter/X</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-neutral-600 ml-auto" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default ShareModal;
