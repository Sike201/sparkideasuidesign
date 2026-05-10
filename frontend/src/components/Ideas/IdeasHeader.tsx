import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Lightbulb, Users, User, Wallet, LogOut, Twitter, Loader2, Send, Trophy, Menu, X as XIcon, Copy, Check, ExternalLink, Flame } from "lucide-react";
import { UserProfile, ViewType } from "./types";
import { DAILY_VOTE_LIMIT } from "./utils";
import { backendSparkApi } from "@/data/api/backendSparkApi";

interface IdeasHeaderProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  userProfile: UserProfile;
  remainingVotes: number;
  isProfileDropdownOpen: boolean;
  setIsProfileDropdownOpen: (open: boolean) => void;
  onOpenSubmitModal: () => void;
  onConnectX: () => void;
  onDisconnectX: () => void;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  isConnectingX: boolean;
  isConnectingWallet: boolean;
}

export function IdeasHeader({
  currentView,
  onViewChange,
  userProfile,
  remainingVotes,
  isProfileDropdownOpen,
  setIsProfileDropdownOpen,
  onOpenSubmitModal,
  onConnectX,
  onDisconnectX,
  onConnectWallet,
  onDisconnectWallet,
  isConnectingX,
  isConnectingWallet,
}: IdeasHeaderProps) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Points state
  const [userPoints, setUserPoints] = useState<number>(0);

  useEffect(() => {
    if (userProfile.walletConnected && userProfile.walletAddress) {
      backendSparkApi.getUserPoints(userProfile.walletAddress)
        .then(data => setUserPoints(data.points))
        .catch(() => {});
    } else {
      setUserPoints(0);
    }
  }, [userProfile.walletConnected, userProfile.walletAddress]);

  // Referral state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [referralLinkCopied, setReferralLinkCopied] = useState(false);
  const [referralCodeCopied, setReferralCodeCopied] = useState(false);
  const [alreadyReferred, setAlreadyReferred] = useState(false);
  const [manualRefCode, setManualRefCode] = useState("");
  const [refApplyStatus, setRefApplyStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isApplyingRef, setIsApplyingRef] = useState(false);

  // Fetch referral code + check if already referred
  useEffect(() => {
    if (!userProfile.walletConnected || !userProfile.walletAddress) {
      setReferralCode(null);
      setAlreadyReferred(false);
      return;
    }
    fetch(`/api/referrals?wallet=${userProfile.walletAddress}&action=code`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setReferralCode(data.code);
          setReferralCount(data.referralCount || 0);
        }
      })
      .catch(() => { });
    // Check if this wallet has already been referred
    fetch(`/api/referrals?wallet=${userProfile.walletAddress}&action=check`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.alreadyReferred) setAlreadyReferred(true);
      })
      .catch(() => { });
  }, [userProfile.walletConnected, userProfile.walletAddress]);

  const referralLink = referralCode ? `${window.location.origin}/ideas?ref=${referralCode}` : null;

  // Auto-open dropdown and pre-fill referral code from localStorage
  const hasCheckedPendingRef = useRef(false);
  useEffect(() => {
    if (hasCheckedPendingRef.current) return;
    const pendingCode = localStorage.getItem('spark_referral_code');
    if (pendingCode) {
      hasCheckedPendingRef.current = true;
      setManualRefCode(pendingCode);
      // Open dropdown immediately so the user sees the pre-filled code
      setIsProfileDropdownOpen(true);
    }
  }, []);

  const handleCopyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setReferralLinkCopied(true);
    setTimeout(() => setReferralLinkCopied(false), 2000);
  };

  const handleCopyReferralCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    setReferralCodeCopied(true);
    setTimeout(() => setReferralCodeCopied(false), 2000);
  };

  const handleApplyRefCode = async () => {
    if (!manualRefCode.trim() || !userProfile.walletAddress) return;
    setIsApplyingRef(true);
    setRefApplyStatus(null);
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: manualRefCode.trim(),
          refereeWallet: userProfile.walletAddress,
          refereeTwitterUsername: userProfile.xUsername || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRefApplyStatus({ type: "success", message: "Referral applied!" });
        setManualRefCode("");
        setAlreadyReferred(true);
        localStorage.removeItem('spark_referral_code');
      } else {
        setRefApplyStatus({ type: "error", message: (data as { error?: string }).error || "Failed" });
      }
    } catch {
      setRefApplyStatus({ type: "error", message: "Network error" });
    } finally {
      setIsApplyingRef(false);
    }
  };

  const navItems = [
    { id: "ideas" as ViewType, label: "Ideas", icon: Lightbulb, path: "/ideas" },
    { id: "funded" as ViewType, label: "Funded", icon: Trophy, path: "/funded" },
    // { id: "teams" as ViewType, label: "Teams", icon: Users, path: "/teams" },
    { id: "explanation" as ViewType, label: "Explanation", icon: Lightbulb, path: "/explanation" },
  ];

  // Determine active nav item from current path
  const getActiveView = () => {
    const path = location.pathname;
    if (path === "/funded") return "funded";
    if (path === "/teams") return "teams";
    if (path === "/agents" || path.startsWith("/agents/")) return "agents";
    if (path === "/explanation") return "explanation";
    if (path === "/roadmap") return "roadmap";
    if (path === "/ideas" || path.startsWith("/ideas/")) return "ideas";
    return currentView;
  };

  const activeView = getActiveView();

  return (
    <>
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#030303]/80 border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 lg:px-16">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/ideas" className="flex items-center hover:opacity-80 transition-opacity">
              <img src="/sparklogo.png" alt="Spark" className="h-7 w-auto" />
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center px-4 py-2 rounded-lg text-[13px] font-medium tracking-wide transition-all duration-300 font-satoshi ${activeView === item.id
                      ? "bg-white/[0.08] text-white border border-white/[0.06]"
                      : "text-neutral-500 hover:text-white hover:bg-white/[0.04]"
                    }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="w-px h-5 bg-white/[0.06] mx-2" />
              <a
                href="https://x.com/JustSparkIdeas"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-500 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
                title="X (Twitter)"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://t.me/sparkdotfun"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-500 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
                title="Telegram"
              >
                <Send className="w-3.5 h-3.5" />
              </a>
            </nav>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              {/* Remaining Votes */}
              {userProfile.xConnected && (
                <span className="hidden sm:inline text-[11px] text-neutral-600 font-medium font-satoshi">
                  {remainingVotes}/{DAILY_VOTE_LIMIT} votes
                </span>
              )}

              {/* Hamburger Button (mobile only) */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-white transition-colors"
              >
                {isMobileMenuOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Submit Button */}
              <button
                onClick={onOpenSubmitModal}
                className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-black text-xs font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/20 transition-all duration-300 font-satoshi"
              >
                Submit Idea
              </button>

              {/* Profile Dropdown */}
              <div className="relative" data-profile-dropdown>
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:border-orange-500/30 hover:bg-white/[0.06] transition-all duration-300"
                >
                  {userProfile.xConnected ? (
                    <img src={userProfile.xAvatar} alt={userProfile.xUsername} className="w-6 h-6 rounded-md" />
                  ) : (
                    <User className="w-4 h-4 text-neutral-400" />
                  )}
                </button>

                {/* Dropdown Menu */}
                {isProfileDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsProfileDropdownOpen(false)}
                    />
                    <div
                      className="absolute right-0 mt-2 w-72 py-2 bg-neutral-900/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl z-50 shadow-2xl shadow-black/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between mb-3">
                          <Link
                            to={userProfile.xUsername ? `/profile/${userProfile.xUsername}` : "/profile/connect"}
                            onClick={() => setIsProfileDropdownOpen(false)}
                            className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wide hover:text-white transition-colors group"
                          >
                            View Profile
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          {userProfile.walletConnected ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-orange-400">
                              <Flame className="w-3 h-3" />
                              {userPoints.toLocaleString()} pts
                            </span>
                          ) : (
                            <span className="text-[10px] text-neutral-500 font-medium">
                              Connect wallet for pts
                            </span>
                          )}
                        </div>

                        {/* X Connection */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${userProfile.xConnected ? "bg-blue-500/10" : "bg-white/[0.04]"
                              }`}>
                              <Twitter className={`w-4 h-4 ${userProfile.xConnected ? "text-blue-400" : "text-neutral-500"}`} />
                            </div>
                            <div>
                              {userProfile.xConnected ? (
                                <>
                                  <p className="text-xs font-medium text-white">{userProfile.xName}</p>
                                  <p className="text-[10px] text-blue-400">@{userProfile.xUsername}</p>
                                </>
                              ) : (
                                <p className="text-xs text-neutral-400">X not connected</p>
                              )}
                            </div>
                          </div>
                          {userProfile.xConnected ? (
                            <button
                              onClick={onDisconnectX}
                              className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-white/[0.05] transition-all"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={onConnectX}
                              disabled={isConnectingX}
                              className="text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {isConnectingX ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
                            </button>
                          )}
                        </div>

                        {/* Wallet Connection */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${userProfile.walletConnected ? "bg-purple-500/10" : "bg-white/[0.04]"
                              }`}>
                              <Wallet className={`w-4 h-4 ${userProfile.walletConnected ? "text-purple-400" : "text-neutral-500"}`} />
                            </div>
                            <div>
                              {userProfile.walletConnected ? (
                                <>
                                  <p className="text-xs font-medium text-white">Wallet</p>
                                  <p className="text-[10px] text-purple-400 font-mono">
                                    {userProfile.walletAddress?.slice(0, 4)}...{userProfile.walletAddress?.slice(-4)}
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-neutral-400">Wallet not connected</p>
                              )}
                            </div>
                          </div>
                          {userProfile.walletConnected ? (
                            <button
                              onClick={onDisconnectWallet}
                              className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-white/[0.05] transition-all"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={onConnectWallet}
                              disabled={isConnectingWallet}
                              className="text-[10px] font-medium text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              {isConnectingWallet ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Referral - Share your code (wallet connected only) */}
                      {userProfile.walletConnected && referralCode && (
                        <div className="px-4 py-3 border-b border-white/5">
                          <Link
                            to={userProfile.xUsername ? `/profile/${userProfile.xUsername}?tab=referrals` : "/profile/referrals"}
                            onClick={() => setIsProfileDropdownOpen(false)}
                            className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-2 hover:text-orange-400 transition-colors block"
                          >
                            Referral{referralCount > 0 ? ` (${referralCount})` : ""} →
                          </Link>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleCopyReferralLink}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${referralLinkCopied
                                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                  : "bg-neutral-800/50 border border-white/10 text-neutral-300 hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/20"
                                }`}
                            >
                              {referralLinkCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {referralLinkCopied ? "Copied!" : "Link"}
                            </button>
                            <button
                              onClick={handleCopyReferralCode}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${referralCodeCopied
                                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                  : "bg-neutral-800/50 border border-white/10 text-neutral-300 hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/20"
                                }`}
                            >
                              {referralCodeCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {referralCodeCopied ? "Copied!" : "Code"}
                            </button>
                          </div>
                          <p className="text-[9px] text-neutral-500 mt-1.5">
                            0.5% of successful launch goes to referrals
                          </p>
                        </div>
                      )}

                      {/* Referral - Apply a code (visible even without wallet if there's a pending code) */}
                      {!alreadyReferred && (manualRefCode || (!userProfile.walletConnected && localStorage.getItem('spark_referral_code'))) && (
                        <div className="px-4 py-3 border-b border-white/5">
                          {!userProfile.walletConnected && !referralCode && (
                            <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-2">
                              Referral Code
                            </p>
                          )}
                          {alreadyReferred ? (
                            <p className="text-[10px] text-emerald-400 font-medium">
                              <Check className="w-3 h-3 inline mr-1" />
                              You are successfully referred!
                            </p>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={manualRefCode}
                                  onChange={(e) => { setManualRefCode(e.target.value); setRefApplyStatus(null); }}
                                  placeholder="Enter referral code"
                                  className="flex-1 px-2 py-1.5 bg-neutral-800/50 border border-white/10 rounded text-[10px] text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500/30"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {userProfile.walletConnected ? (
                                  <button
                                    onClick={handleApplyRefCode}
                                    disabled={!manualRefCode.trim() || isApplyingRef}
                                    className="px-2 py-1.5 bg-white text-black text-[10px] font-semibold rounded hover:bg-neutral-200 transition-colors disabled:opacity-50"
                                  >
                                    {isApplyingRef ? "..." : "Apply"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={onConnectWallet}
                                    className="px-2 py-1.5 bg-purple-500 text-white text-[10px] font-semibold rounded hover:bg-purple-400 transition-colors"
                                  >
                                    Connect
                                  </button>
                                )}
                              </div>
                              {!userProfile.walletConnected && (
                                <p className="text-[9px] text-neutral-500 mt-1.5">
                                  Connect your wallet to apply this referral code
                                </p>
                              )}
                              {refApplyStatus && (
                                <p className={`text-[9px] mt-1 ${refApplyStatus.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                                  {refApplyStatus.message}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Already referred indicator (wallet connected, in share section) */}
                      {userProfile.walletConnected && referralCode && alreadyReferred && (
                        <div className="px-4 py-2 border-b border-white/5">
                          <p className="text-[10px] text-emerald-400 font-medium">
                            <Check className="w-3 h-3 inline mr-1" />
                            You are successfully referred!
                          </p>
                        </div>
                      )}

                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Panel */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-64 bg-[#0a0a0a] border-l border-white/[0.04] p-6 backdrop-blur-xl">
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-white transition-colors mb-6"
            >
              <XIcon className="w-5 h-5" />
            </button>

            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeView === item.id
                      ? "bg-white/10 text-white"
                      : "text-neutral-400 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/5">
              <a
                href="https://x.com/JustSparkIdeas"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                title="X (Twitter)"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://t.me/sparkdotfun"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Telegram"
              >
                <Send className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default IdeasHeader;
