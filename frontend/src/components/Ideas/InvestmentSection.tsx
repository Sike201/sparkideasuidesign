import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { DollarSign, TrendingUp, Wallet, X, Loader2, Users, ExternalLink } from "lucide-react";
import { Idea, UserProfile } from "./types";
import { sendTokenTo } from "shared/solana/sendTokenTo";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { getRpcUrl } from "@/utils/rpc";

// USDC mint address on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;

interface InvestmentSectionProps {
  idea: Idea;
  userProfile: UserProfile;
  onConnectWallet: () => void;
  isConnectingWallet: boolean;
  onCommentPosted?: () => void;
  jupiterPrice?: number | null;
}

interface InvestmentRecord {
  id: string;
  investor_wallet: string;
  amount_usdc: number;
  status: string;
  transaction_signature?: string;
}

export function InvestmentSection({
  idea,
  userProfile,
  onConnectWallet,
  isConnectingWallet,
  onCommentPosted,
}: InvestmentSectionProps) {
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [depositAmount, setDepositAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [userInvestments, setUserInvestments] = useState<InvestmentRecord[]>([]);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [treasuryWallet, setTreasuryWallet] = useState<string | null>(null);
  const [investmentComment, setInvestmentComment] = useState("");

  const goal = idea.estimatedPrice || 0;
  const raised = idea.raisedAmount || 0;
  const progress = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const remaining = Math.max(0, goal - raised);

  useEffect(() => {
    const fetchInvestments = async () => {
      try {
        const response = await fetch(`/api/idea-investments?ideaId=${idea.id}`);
        if (response.ok) {
          const data = await response.json();
          setInvestments(data.investments || []);
          setTreasuryWallet(data.treasury_wallet || null);
          if (userProfile.walletAddress) {
            const userInvs = data.investments?.filter(
              (inv: InvestmentRecord) => inv.investor_wallet === userProfile.walletAddress
            ) || [];
            setUserInvestments(userInvs);
          } else {
            setUserInvestments([]);
          }
        }
      } catch (error) {
        console.error("Failed to fetch investments:", error);
      }
    };
    if (idea.id) fetchInvestments();
  }, [idea.id, userProfile.walletAddress]);

  // Fetch USDC balance when wallet is connected
  useEffect(() => {
    const fetchUsdcBalance = async () => {
      if (!userProfile.walletAddress || !userProfile.walletConnected) {
        setUsdcBalance(null);
        return;
      }

      setIsLoadingBalance(true);
      try {
        const rpcUrl = getRpcUrl();
        console.log("🔗 [USDC Balance] Using RPC URL:", rpcUrl.substring(0, 50) + "...");
        const connection = new Connection(rpcUrl, 'confirmed');
        const walletPublicKey = new PublicKey(userProfile.walletAddress);
        const usdcMintPublicKey = new PublicKey(USDC_MINT);
        
        const tokenAccount = await getAssociatedTokenAddress(
          usdcMintPublicKey,
          walletPublicKey
        );

        try {
          const accountInfo = await getAccount(connection, tokenAccount);
          const balance = Number(accountInfo.amount) / Math.pow(10, USDC_DECIMALS);
          console.log("✅ [USDC Balance] Fetched balance:", balance, "USDC");
          setUsdcBalance(balance);
        } catch (error) {
          // Token account doesn't exist, balance is 0
          console.log("ℹ️ [USDC Balance] Token account doesn't exist, balance is 0");
          setUsdcBalance(0);
        }
      } catch (error) {
        console.error("❌ [USDC Balance] Failed to fetch USDC balance:", error);
        setUsdcBalance(null);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchUsdcBalance();
  }, [userProfile.walletAddress, userProfile.walletConnected, showDepositModal]);

  const handleDeposit = async () => {
    if (!userProfile.walletAddress || !depositAmount || parseFloat(depositAmount) <= 0) return;
    
    // Wait for treasury wallet if not yet loaded
    if (!treasuryWallet) {
      toast.warning("Loading treasury wallet information. Please try again in a moment.");
      return;
    }
    
    setIsDepositing(true);
    setTxSignature(null);
    
    try {
      // Get Phantom wallet provider
      // @ts-expect-error - Phantom wallet global
      const provider = window?.phantom?.solana;
      if (!provider?.isPhantom) {
        throw new Error("Please connect your Phantom wallet");
      }

      // Get signTransaction function
      const signTransaction = async (transaction: any) => {
        try {
          const signed = await provider.signTransaction(transaction);
          return signed;
        } catch (err) {
          console.error("Transaction signing failed:", err);
          throw err;
        }
      };

      // Convert USDC amount to token units (6 decimals)
      const amountInTokens = Math.floor(parseFloat(depositAmount) * Math.pow(10, USDC_DECIMALS));

      console.log(`Sending ${depositAmount} USDC (${amountInTokens} tokens) to treasury wallet: ${treasuryWallet}`);

      // Send USDC to idea-specific treasury wallet
      const transactionSignature = await sendTokenTo({
        amount: amountInTokens,
        decimals: USDC_DECIMALS,
        tokenMint: USDC_MINT,
        walletAddress: userProfile.walletAddress,
        destAddress: treasuryWallet,
        signTransaction,
        walletProvider: "PHANTOM",
        cluster: "mainnet",
      });

      console.log("Transaction successful:", transactionSignature);
      setTxSignature(transactionSignature);

      // Record investment in database
      const response = await fetch('/api/idea-investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaId: idea.id,
          investorWallet: userProfile.walletAddress,
          amountUsdc: parseFloat(depositAmount),
          transactionSignature,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Submit comment if provided
        if (investmentComment.trim() && userProfile.xConnected) {
          try {
            await fetch("/api/idea-comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ideaId: idea.id,
                content: investmentComment.trim(),
                authorUsername: userProfile.xUsername || "investor",
                authorAvatar: userProfile.xAvatar || "",
                authorTwitterId: userProfile.xId || "",
              }),
            });
          } catch (err) {
            console.error("Failed to submit investment comment:", err);
          }
        }

        // Refresh comments to update "invested" badges
        onCommentPosted?.();

        setShowDepositModal(false);
        setDepositAmount("");
        setInvestmentComment("");
        
        // Update treasury wallet if returned
        if (data.treasury_wallet) {
          setTreasuryWallet(data.treasury_wallet);
        }
        
        // Refresh investments to get updated list
        const invResponse = await fetch(`/api/idea-investments?ideaId=${idea.id}`);
        if (invResponse.ok) {
          const invData = await invResponse.json();
          setInvestments(invData.investments || []);
          if (invData.treasury_wallet) {
            setTreasuryWallet(invData.treasury_wallet);
          }
          if (userProfile.walletAddress) {
            const userInvs = invData.investments?.filter(
              (inv: InvestmentRecord) => inv.investor_wallet === userProfile.walletAddress
            ) || [];
            setUserInvestments(userInvs);
          }
        }
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to record investment");
      }
    } catch (error: any) {
      console.error("Deposit failed:", error);
      toast.error(error.message || "Failed to deposit. Please try again.");
    } finally {
      setIsDepositing(false);
    }
  };

  if (!idea.estimatedPrice || idea.estimatedPrice <= 0) {
    return null;
  }

  return (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-emerald-500/15">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h4 className="text-sm font-satoshi font-bold text-white">Investment Round</h4>
          <p className="text-[10px] font-geist text-neutral-500">Invest in this idea with USDC</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-satoshi text-neutral-400">Progress</span>
          <span className="text-xs font-satoshi font-semibold text-emerald-400">{progress.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-xl bg-white/[0.03]">
          <p className="text-sm font-satoshi font-bold text-emerald-400">${raised.toLocaleString()}</p>
          <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Raised</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-white/[0.03]">
          <p className="text-sm font-satoshi font-bold text-white">${goal.toLocaleString()}</p>
          <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Goal</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-white/[0.03]">
          <p className="text-sm font-satoshi font-bold text-orange-400">{investments.length}</p>
          <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Investors</p>
        </div>
      </div>

      {/* User Investments */}
      {userInvestments.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/[0.06]">
          <div>
            <p className="text-[10px] font-satoshi text-emerald-400 uppercase mb-1">
              Your Investment{userInvestments.length > 1 ? 's' : ''} ({userInvestments.length})
            </p>
            <p className="text-lg font-satoshi font-bold text-white">
              ${userInvestments.reduce((sum, inv) => sum + inv.amount_usdc, 0).toLocaleString()} USDC Total
            </p>
            <div className="mt-2 space-y-1">
              {userInvestments.map((inv, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">
                    ${inv.amount_usdc.toLocaleString()} USDC
                  </span>
                  {inv.transaction_signature && (
                    <a
                      href={`https://solscan.io/tx/${inv.transaction_signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      View
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {!userProfile.walletConnected ? (
        <button 
          onClick={onConnectWallet} 
          disabled={isConnectingWallet} 
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-emerald-400 disabled:opacity-50"
        >
          {isConnectingWallet ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </>
          )}
        </button>
      ) : (
        <button 
          onClick={() => setShowDepositModal(true)} 
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-emerald-400"
        >
          <DollarSign className="w-4 h-4" />
          {userInvestments.length > 0 ? "Invest More" : "Invest Now"}
        </button>
      )}

      {/* Recent Investors */}
      {investments.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3 h-3 text-neutral-500" />
            <span className="text-[10px] font-satoshi text-neutral-500 uppercase tracking-wider">Recent Investors</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {investments.slice(0, 5).map((inv, i) => (
              <div 
                key={i} 
                className="px-2 py-1 rounded-xl bg-white/[0.04] text-[10px] font-geist text-neutral-400"
                title={inv.investor_wallet}
              >
                {inv.investor_wallet.slice(0, 4)}...{inv.investor_wallet.slice(-4)} • ${inv.amount_usdc}
              </div>
            ))}
            {investments.length > 5 && (
              <div className="px-2 py-1 rounded-xl bg-white/[0.04] text-[10px] font-geist text-neutral-500">
                +{investments.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xl" 
            onClick={() => setShowDepositModal(false)} 
          />
          <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-neutral-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 border border-emerald-500/[0.06]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-satoshi font-bold text-white">Invest USDC</h3>
              <button 
                onClick={() => setShowDepositModal(false)} 
                className="text-neutral-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase mb-1.5 block">
                  Amount (USDC)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input 
                    type="number" 
                    value={depositAmount} 
                    onChange={(e) => setDepositAmount(e.target.value)} 
                    placeholder="Enter amount..." 
                    min="0.01" 
                    max={usdcBalance !== null ? Math.min(remaining, usdcBalance) : remaining} 
                    step="0.01"
                    className="w-full h-12 pl-9 pr-20 bg-white/[0.04] border border-white/[0.06] rounded-xl text-white font-geist text-sm placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50" 
                  />
                  {userProfile.walletConnected && usdcBalance !== null && usdcBalance > 0 && (
                    <button
                      onClick={() => {
                        const maxAmount = Math.min(remaining, usdcBalance);
                        setDepositAmount(maxAmount.toFixed(2));
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/30 transition-colors"
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] font-geist text-neutral-500">
                    Remaining: ${remaining.toLocaleString()} USDC
                  </p>
                  {usdcBalance !== null && (
                    <p className="text-[10px] font-geist text-neutral-500">
                      Available: ${Math.min(remaining, usdcBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Optional Comment */}
              {userProfile.xConnected && (
                <div>
                  <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase mb-1.5 block">
                    Comment (optional)
                  </label>
                  <textarea
                    value={investmentComment}
                    onChange={(e) => setInvestmentComment(e.target.value)}
                    placeholder="What's missing? Share features, use cases, or directions you'd love to see..."
                    rows={2}
                    className="w-full p-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-white font-geist text-xs placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  />
                </div>
              )}

              {txSignature && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/[0.06]">
                  <p className="text-[10px] text-emerald-400 mb-1">Transaction sent!</p>
                  <a
                    href={`https://solscan.io/tx/${txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
                  >
                    View on Solscan
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDepositModal(false)} 
                  className="flex-1 py-2.5 text-neutral-400 font-satoshi text-sm font-medium hover:text-white"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeposit} 
                  disabled={isDepositing || !depositAmount || parseFloat(depositAmount) <= 0} 
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isDepositing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Confirm Investment"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InvestmentSection;
