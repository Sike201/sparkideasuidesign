import { useState, useEffect } from "react";
import { Twitter, Wallet, LogOut, Loader2, User, Check, X, Share2, Copy, Users as UsersIcon } from "lucide-react";
import { UserProfile } from "./types";

interface ProfileViewProps {
  userProfile: UserProfile;
  onConnectX: () => void;
  onDisconnectX: () => void;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  isConnectingX: boolean;
  isConnectingWallet: boolean;
}

export function ProfileView({
  userProfile,
  onConnectX,
  onDisconnectX,
  onConnectWallet,
  onDisconnectWallet,
  isConnectingX,
  isConnectingWallet,
}: ProfileViewProps) {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [referrals, setReferrals] = useState<{ referee_wallet: string; referee_twitter_username?: string; created_at: string }[]>([]);
  const [isLoadingReferral, setIsLoadingReferral] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [applyStatus, setApplyStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);

  // Fetch referral code when wallet is connected
  useEffect(() => {
    if (!userProfile.walletConnected || !userProfile.walletAddress) {
      setReferralCode(null);
      return;
    }
    setIsLoadingReferral(true);
    fetch(`/api/referrals?wallet=${userProfile.walletAddress}&action=code`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setReferralCode(data.code);
          setReferralCount(data.referralCount || 0);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingReferral(false));
  }, [userProfile.walletConnected, userProfile.walletAddress]);

  // Fetch referral list
  useEffect(() => {
    if (!userProfile.walletAddress || !showReferrals) return;
    fetch(`/api/referrals?wallet=${userProfile.walletAddress}&action=referrals`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.referrals) setReferrals(data.referrals);
      })
      .catch(() => {});
  }, [userProfile.walletAddress, showReferrals]);

  const referralLink = referralCode ? `${window.location.origin}?ref=${referralCode}` : null;

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyCode = async () => {
    if (!manualCode.trim() || !userProfile.walletAddress) return;
    setIsApplying(true);
    setApplyStatus(null);
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: manualCode.trim(),
          refereeWallet: userProfile.walletAddress,
          refereeTwitterUsername: userProfile.xUsername || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplyStatus({ type: "success", message: "Referral applied!" });
        setManualCode("");
        localStorage.removeItem('spark_referral_code');
        localStorage.removeItem('spark_referral_shown');
      } else {
        setApplyStatus({ type: "error", message: (data as { error?: string }).error || "Failed to apply code" });
      }
    } catch {
      setApplyStatus({ type: "error", message: "Network error" });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
          <User className="w-8 h-8 text-neutral-400" />
        </div>
        <h2 className="text-2xl font-semibold text-white mb-2 font-satoshi">Your Profile</h2>
        <p className="text-sm text-neutral-500 font-geist">Manage your connected accounts</p>
      </div>

      <div className="space-y-4">
        {/* X/Twitter Connection */}
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                userProfile.xConnected ? "bg-blue-500/10 border border-blue-500/20" : "bg-white/[0.04] border border-white/[0.06]"
              }`}>
                <Twitter className={`w-6 h-6 ${userProfile.xConnected ? "text-blue-400" : "text-neutral-500"}`} />
              </div>
              <div>
                <h3 className="text-sm font-satoshi font-bold text-white mb-0.5">X (Twitter)</h3>
                {userProfile.xConnected ? (
                  <div className="flex items-center gap-2">
                    <img src={userProfile.xAvatar} alt={userProfile.xUsername} className="w-5 h-5 rounded-full" />
                    <span className="text-xs text-blue-400">@{userProfile.xUsername}</span>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 font-geist">Connect to vote, comment, and submit ideas</p>
                )}
              </div>
            </div>
            {userProfile.xConnected ? (
              <button
                onClick={onDisconnectX}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors font-satoshi"
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect
              </button>
            ) : (
              <button
                onClick={onConnectX}
                disabled={isConnectingX}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs font-satoshi font-bold text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                {isConnectingX ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Twitter className="w-3.5 h-3.5" />
                    Connect
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Wallet Connection */}
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                userProfile.walletConnected ? "bg-purple-500/10 border border-purple-500/20" : "bg-white/[0.04] border border-white/[0.06]"
              }`}>
                <Wallet className={`w-6 h-6 ${userProfile.walletConnected ? "text-purple-400" : "text-neutral-500"}`} />
              </div>
              <div>
                <h3 className="text-sm font-satoshi font-bold text-white mb-0.5">Solana Wallet</h3>
                {userProfile.walletConnected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-400 font-mono">
                      {userProfile.walletAddress?.slice(0, 4)}...{userProfile.walletAddress?.slice(-4)}
                    </span>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 font-geist">Connect to invest in ideas with USDC</p>
                )}
              </div>
            </div>
            {userProfile.walletConnected ? (
              <button
                onClick={onDisconnectWallet}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors font-satoshi"
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect
              </button>
            ) : (
              <button
                onClick={onConnectWallet}
                disabled={isConnectingWallet}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs font-satoshi font-bold text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
              >
                {isConnectingWallet ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wallet className="w-3.5 h-3.5" />
                    Connect
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Referral Program */}
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-500/10 border border-orange-500/20">
              <Share2 className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-satoshi font-bold text-white mb-0.5">Referral Program</h3>
              <p className="text-xs text-neutral-500 font-geist">
                {userProfile.walletConnected
                  ? `${referralCount} user${referralCount !== 1 ? "s" : ""} referred`
                  : "Connect your wallet to get a referral link"}
              </p>
            </div>
          </div>

          {!userProfile.walletConnected ? (
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
              <p className="text-xs text-neutral-500 font-geist">Connect your wallet above to generate your referral link</p>
            </div>
          ) : isLoadingReferral ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Referral Link */}
              {referralLink && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-xs text-neutral-300 font-geist-mono truncate">
                    {referralLink}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors font-satoshi ${
                      copied
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-satoshi"
                        : "bg-orange-500/10 border border-orange-500/15 text-orange-400 hover:bg-orange-500/20"
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}

              {/* Referrals List Toggle */}
              {referralCount > 0 && (
                <button
                  onClick={() => setShowReferrals(!showReferrals)}
                  className="flex items-center gap-1.5 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <UsersIcon className="w-3 h-3" />
                  {showReferrals ? "Hide" : "Show"} referred users ({referralCount})
                </button>
              )}

              {showReferrals && referrals.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {referrals.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-white/[0.03]">
                      <span className="text-[10px] font-mono text-neutral-400">
                        {r.referee_wallet.slice(0, 4)}...{r.referee_wallet.slice(-4)}
                      </span>
                      {r.referee_twitter_username && (
                        <span className="text-[10px] text-blue-400">@{r.referee_twitter_username}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Enter Referral Code */}
              <div className="pt-2 border-t border-white/[0.06]">
                <p className="text-[10px] text-neutral-500 mb-2 font-satoshi">Have a referral code?</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => { setManualCode(e.target.value); setApplyStatus(null); }}
                    placeholder="Enter code"
                    className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500/30 font-geist-mono"
                  />
                  <button
                    onClick={handleApplyCode}
                    disabled={!manualCode.trim() || isApplying}
                    className="px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-black text-xs font-bold rounded-xl font-satoshi hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isApplying ? "..." : "Apply"}
                  </button>
                </div>
                {applyStatus && (
                  <p className={`text-[10px] mt-1.5 font-satoshi ${applyStatus.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                    {applyStatus.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Link Accounts Notice */}
        {userProfile.xConnected && userProfile.walletConnected && (
          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-satoshi font-medium text-emerald-400 mb-1">Accounts Linked</h4>
                <p className="text-xs text-neutral-400 font-geist">
                  Your X account and wallet are now linked. You can vote, comment, submit ideas, and invest in projects.
                </p>
              </div>
            </div>
          </div>
        )}

        {!userProfile.xConnected && !userProfile.walletConnected && (
          <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20">
            <div className="flex items-start gap-3">
              <X className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-satoshi font-medium text-orange-400 mb-1">No Accounts Connected</h4>
                <p className="text-xs text-neutral-400 font-geist">
                  Connect your X account to participate in voting and discussions. Connect your wallet to invest in ideas.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileView;
