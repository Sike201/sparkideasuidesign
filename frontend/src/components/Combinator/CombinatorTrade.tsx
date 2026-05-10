import { useState, useEffect, useCallback } from "react";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { toast } from "react-toastify";
import { useWalletContext } from "@/hooks/useWalletContext";
import { getRpcUrl } from "@/utils/rpc";
import type { MarketOption } from "@/services/combinatorService";
import { sdkSwap, sdkQuote, sdkDeposit, sdkRedeem, sdkGetBalances, sdkDepositAndSwap } from "@/services/combinatorSdk";
import type { SdkBalances } from "@/services/combinatorSdk";
import WalletProfileBadge, { type WalletProfile } from "@/components/Hackathon/WalletProfileBadge";

const QUICK_AMOUNTS = ["0.1", "1", "5", "10"];

type TradeTab = "trade" | "redeem" | "chat" | "history";

type ChatMessage = { id: string; wallet: string; content: string; created_at: string };

interface CombinatorTradeProps {
  proposalPda: string;
  options: MarketOption[];
  isActive: boolean;
  isFinalized?: boolean;
  vaultPda?: string;
  baseMint?: string;
  quoteMint?: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  baseDecimals?: number;
  quoteDecimals?: number;
  tradeUrl?: string;
  className?: string;
  twitterProfile?: { xId?: string; xUsername?: string; xConnected?: boolean };
  onPricePreview?: (optionIndex: number, priceAfter: number | null) => void;
  onTradeExecuted?: () => void;
}

export default function CombinatorTrade({
  proposalPda,
  options,
  isActive,
  isFinalized = false,
  vaultPda,
  baseMint,
  quoteMint,
  baseSymbol = "TOKEN",
  quoteSymbol = "USDC",
  baseDecimals = 9,
  quoteDecimals = 6,
  tradeUrl,
  className = "",
  twitterProfile,
  onPricePreview,
  onTradeExecuted,
}: CombinatorTradeProps) {
  const { isWalletConnected, address, walletProvider, signTransaction: ctxSignTransaction } = useWalletContext();

  const [tab, setTab] = useState<TradeTab>(isFinalized ? "redeem" : "trade");
  const [selectedOption, setSelectedOption] = useState<number>(0);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [quoteOutput, setQuoteOutput] = useState<string | null>(null);
  const [balances, setBalances] = useState<SdkBalances | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  // Tracks a SUCCESSFUL redeem within this component instance — flips
  // the redeem button to a done state and disables it so the user
  // doesn't pile up no-op transactions. Stays false on every failure
  // path (network error, "nothing to redeem", thrown ix) and resets
  // when `vaultPda` changes (user navigated to another finalized
  // market). Intentionally not persisted: a refresh re-derives the
  // state from on-chain balances, which is the source of truth.
  const [redeemed, setRedeemed] = useState(false);
  useEffect(() => { setRedeemed(false); }, [vaultPda]);
  const [walletBalances, setWalletBalances] = useState<{ base: number; quote: number }>({ base: 0, quote: 0 });

  // ── Custodial wallet (X login) ────────────────────────────
  const [custodialWallet, setCustodialWallet] = useState<string | null>(null);
  const [custodialChecked, setCustodialChecked] = useState(false);
  // Wallet takes priority over custodial when both are connected
  const isCustodial = !!custodialWallet && !!twitterProfile?.xId && !isWalletConnected;

  useEffect(() => {
    if (!twitterProfile?.xId || !proposalPda) { setCustodialChecked(true); return; }
    const params = new URLSearchParams({ proposal_pda: proposalPda });
    if (twitterProfile.xId) params.set("twitter_id", twitterProfile.xId);
    if (twitterProfile.xUsername) params.set("twitter_username", twitterProfile.xUsername);
    fetch(`/api/custodial-wallet?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setCustodialWallet(data?.wallet_address || null);
        setCustodialChecked(true);
      })
      .catch(() => setCustodialChecked(true));
  }, [twitterProfile?.xId, proposalPda]);
  const [tradeHistory, setTradeHistory] = useState<{
    action: string;
    wallet: string;
    option_label: string | null;
    side: string | null;
    amount: number;
    token: string | null;
    tx_signature: string | null;
    timestamp: string;
    // Server-side JOIN against `custodial_wallets` — present when the
    // trader is a custodial mini-app user. Self-custody trades stay null
    // and the UI keeps the short address fallback.
    twitter_username?: string | null;
    twitter_id?: string | null;
    wallet_type?: "public" | "private" | null;
  }[]>([]);

  // ── Chat state ───────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [chatSortOrder, setChatSortOrder] = useState<"newest" | "oldest">("newest");
  const [chatUsernames, setChatUsernames] = useState<Record<string, WalletProfile | null>>({});

  const tokenLabel = (vt: "base" | "quote") => vt === "quote" ? quoteSymbol : baseSymbol;

  // ── Wallet helpers ────────────────────────────────────────

  function getWalletAdapter() {
    if (!address || !walletProvider || !isWalletConnected) return null;
    return {
      publicKey: new PublicKey(address),
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        const signed = await ctxSignTransaction(tx as Transaction, walletProvider as any);
        if (!signed) throw new Error("Transaction signing failed");
        return signed as unknown as T;
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        const signed: T[] = [];
        for (const tx of txs) {
          const s = await ctxSignTransaction(tx as Transaction, walletProvider as any);
          if (!s) throw new Error("Transaction signing failed");
          signed.push(s as unknown as T);
        }
        return signed;
      },
    };
  }

  async function signAndSend(tx: Transaction): Promise<string> {
    if (!walletProvider) throw new Error("Wallet not connected");
    const signedTx = await ctxSignTransaction(tx, walletProvider as any);
    if (!signedTx) throw new Error("Transaction signing failed or was rejected");
    const connection = new Connection(getRpcUrl(), "confirmed");
    const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });
    // Poll confirmation 6 times, 3s apart — don't throw on timeout
    (async () => {
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const status = await connection.getSignatureStatus(sig);
          if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") return;
        } catch { /* retry */ }
      }
    })();
    return sig;
  }

  function showSuccess(action: string, sig: string) {
    toast.success(
      <span>{action} <a href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener noreferrer" className="underline">View tx</a></span>
    );
    onTradeExecuted?.();
  }

  async function executeCustodialTrade(params: {
    action: string; amount?: number; decimals?: number; vault_type?: string;
    pool_address?: string; side?: string; option_index?: number; option_label?: string;
  }): Promise<string> {
    const res = await fetch("/api/custodial-trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        twitter_id: twitterProfile?.xId,
        proposal_pda: proposalPda,
        vault_pda: vaultPda,
        ...params,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Custodial trade failed");
    return data.signature;
  }

  function recordTrade(action: string, amt: number, token: string, sig: string, optLabel?: string, optIndex?: number, side?: string) {
    fetch("/api/combinator-trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal_pda: proposalPda,
        wallet: address,
        action,
        option_label: optLabel,
        option_index: optIndex,
        side,
        amount: amt,
        token,
        tx_signature: sig,
      }),
    }).then(() => fetchTradeHistory()).catch(() => {});
  }

  // ── Fetch balances ────────────────────────────────────────

  const fetchBalances = useCallback(async () => {
    const effectiveAddress = isCustodial ? custodialWallet : address;
    if (!effectiveAddress || !vaultPda) return;
    if (!isCustodial && !isWalletConnected) return;
    // For custodial: create a read-only wallet adapter with the custodial address
    const walletAdapter = isCustodial ? {
      publicKey: new PublicKey(effectiveAddress),
      signTransaction: async <T,>(tx: T) => tx,
      signAllTransactions: async <T,>(txs: T[]) => txs,
    } : getWalletAdapter();
    if (!walletAdapter) return;
    try {
      const data = await sdkGetBalances(walletAdapter, vaultPda);
      setBalances(data);
    } catch {
      // SDK call may fail if user has no position
    }
  }, [vaultPda, address, isWalletConnected, isCustodial, custodialWallet]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // ── Fetch wallet token balances (for MAX button) ──────────

  const fetchWalletBalances = useCallback(async () => {
    const effectiveAddress = isCustodial ? custodialWallet : address;
    if (!effectiveAddress || !baseMint || !quoteMint) return;
    if (!isCustodial && !isWalletConnected) return;
    try {
      const connection = new Connection(getRpcUrl(), "confirmed");
      const owner = new PublicKey(effectiveAddress);
      const [baseAccounts, quoteAccounts] = await Promise.all([
        connection.getTokenAccountsByOwner(owner, { mint: new PublicKey(baseMint) }),
        connection.getTokenAccountsByOwner(owner, { mint: new PublicKey(quoteMint) }),
      ]);
      let baseBalance = 0;
      let quoteBalance = 0;
      for (const { account } of baseAccounts.value) {
        const rawAmount = account.data.readBigUInt64LE(64);
        baseBalance += Number(rawAmount) / 10 ** baseDecimals;
      }
      for (const { account } of quoteAccounts.value) {
        const rawAmount = account.data.readBigUInt64LE(64);
        quoteBalance += Number(rawAmount) / 10 ** quoteDecimals;
      }
      setWalletBalances({ base: baseBalance, quote: quoteBalance });
    } catch { /* silent */ }
  }, [isWalletConnected, address, baseMint, quoteMint, baseDecimals, quoteDecimals, isCustodial, custodialWallet]);

  useEffect(() => { fetchWalletBalances(); }, [fetchWalletBalances]);


  // ── Fetch trade history (history tab) ──────────────────────

  const fetchTradeHistory = useCallback(() => {
    if (!proposalPda) return;
    fetch(`/api/combinator-trades?proposal_pda=${encodeURIComponent(proposalPda)}&limit=100`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data) setTradeHistory(data.data); })
      .catch(() => {});
  }, [proposalPda]);

  useEffect(() => {
    if (tab === "history") fetchTradeHistory();
  }, [tab, fetchTradeHistory]);

  // ── Chat: fetch + polling ─────────────────────────────────
  const fetchChatMessages = useCallback(async () => {
    if (!proposalPda) return;
    try {
      const res = await fetch(`/api/combinator-chat?proposal_pda=${encodeURIComponent(proposalPda)}&limit=200`);
      if (!res.ok) return;
      const data = await res.json() as { data?: ChatMessage[] };
      if (data?.data) setChatMessages(data.data);
    } catch { /* silent */ }
  }, [proposalPda]);

  useEffect(() => {
    if (tab !== "chat") return;
    fetchChatMessages();
    const interval = setInterval(fetchChatMessages, 5000);
    return () => clearInterval(interval);
  }, [tab, fetchChatMessages]);

  // Resolve wallet → username for chat messages (only unknown wallets)
  useEffect(() => {
    const unknown = Array.from(new Set(chatMessages.map(m => m.wallet))).filter(w => w && !(w in chatUsernames));
    if (unknown.length === 0) return;
    let cancelled = false;
    fetch(`/api/usernames?wallets=${encodeURIComponent(unknown.join(","))}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { map?: Record<string, WalletProfile> } | null) => {
        if (cancelled) return;
        setChatUsernames(prev => {
          const next = { ...prev };
          // Mark every queried wallet as checked (null = no profile, avoids re-querying)
          for (const w of unknown) next[w] = data?.map?.[w] || null;
          return next;
        });
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [chatMessages, chatUsernames]);

  const senderAddress = isWalletConnected ? address : (isCustodial ? custodialWallet : null);

  const handleSendChat = async () => {
    const content = chatInput.trim();
    if (!content) return;
    if (!senderAddress) { toast.error("Connect your wallet to send a message"); return; }
    setIsSendingChat(true);
    try {
      const res = await fetch("/api/combinator-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_pda: proposalPda, wallet: senderAddress, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error || "Failed to send message");
        return;
      }
      setChatInput("");
      await fetchChatMessages();
    } catch {
      toast.error("Failed to send message");
    } finally {
      setIsSendingChat(false);
    }
  };

  // ── Fetch quote (trade tab, SDK only) ─────────────────────

  useEffect(() => {
    if (tab !== "trade" || !amount || parseFloat(amount) <= 0) {
      setQuoteOutput(null);
      onPricePreview?.(selectedOption, null);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsQuoting(true);
      try {
        const opt = options[selectedOption];
        if (!opt?.poolAddress || opt.poolAddress === "11111111111111111111111111111111") return;
        const quoteInputDecimals = side === "BUY" ? quoteDecimals : baseDecimals;
        const q = await sdkQuote(opt.poolAddress, side === "BUY", parseFloat(amount), quoteInputDecimals);
        setQuoteOutput(q.outputAmount);
        // Compute preview price from SDK quote ratio
        if (q.spotPriceAfter > 0 && q.spotPriceBefore > 0 && opt.spotPrice > 0) {
          let ratio = q.spotPriceAfter / q.spotPriceBefore;
          // Ensure direction is correct: BUY → price up, SELL → price down
          if (side === "BUY" && ratio < 1) ratio = 1 / ratio;
          if (side === "SELL" && ratio > 1) ratio = 1 / ratio;
          const previewPrice = opt.spotPrice * ratio;
          onPricePreview?.(opt.index, previewPrice);
        }
      } catch {
        setQuoteOutput(null);
        onPricePreview?.(selectedOption, null);
      } finally {
        setIsQuoting(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [tab, amount, selectedOption, side, options, quoteDecimals]);

  // ── Handlers ──────────────────────────────────────────────

  const handleTrade = async () => {
    if (!isCustodial && (!isWalletConnected || !address)) { toast.error("Connect your wallet first"); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter an amount"); return; }
    const opt = options[selectedOption];
    if (!opt?.poolAddress) { toast.error("Pool not available"); return; }

    setIsExecuting(true);
    try {
      const swapDecimals = side === "BUY" ? quoteDecimals : baseDecimals;
      const tradeAmount = parseFloat(amount);
      let sig: string;

      if (isCustodial) {
        // Custodial: deposit then trade as 2 sequential API calls
        const depositVault = side === "BUY" ? "quote" : "base";
        const depositDecimals = side === "BUY" ? quoteDecimals : baseDecimals;
        await executeCustodialTrade({ action: "deposit", amount: tradeAmount, decimals: depositDecimals, vault_type: depositVault });
        sig = await executeCustodialTrade({ action: "trade", amount: tradeAmount, decimals: swapDecimals, pool_address: opt.poolAddress, side, option_index: opt.index, option_label: opt.label });
      } else {
        const walletAdapter = getWalletAdapter();
        if (!walletAdapter) { toast.error("Wallet not connected"); return; }

        // Check vault balance for this option
        const vaultBal = side === "BUY"
          ? (balances?.quote?.condBalances?.[selectedOption]?.toNumber() ?? 0) / 10 ** quoteDecimals
          : (balances?.base?.condBalances?.[selectedOption]?.toNumber() ?? 0) / 10 ** baseDecimals;

        if (vaultBal >= tradeAmount) {
          // Sufficient balance in vault — swap directly
          const { tx } = await sdkSwap(walletAdapter, opt.poolAddress, side === "BUY", tradeAmount, swapDecimals, 0.5);
          sig = await signAndSend(tx);
        } else if (vaultPda) {
          // Need deposit first, then swap (2 sequential transactions)
          const depositVault = side === "BUY" ? "quote" : "base";
          const depositDecimals = side === "BUY" ? quoteDecimals : baseDecimals;
          const depositAmount = tradeAmount - vaultBal;
          const depositTx = await sdkDeposit(walletAdapter, vaultPda, depositVault, depositAmount, depositDecimals);
          await signAndSend(depositTx);
          const { tx: swapTx } = await sdkSwap(walletAdapter, opt.poolAddress, side === "BUY", tradeAmount, swapDecimals, 0.5);
          sig = await signAndSend(swapTx);
        } else {
          toast.error("Vault not available"); return;
        }
      }

      showSuccess("Trade executed!", sig);
      recordTrade("trade", tradeAmount, side === "BUY" ? quoteSymbol : opt.label, sig, opt.label, opt.index, side);
      setAmount("");
      setQuoteOutput(null);
      fetchBalances(); fetchWalletBalances();
      setTimeout(() => { fetchBalances(); fetchWalletBalances(); }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRedeem = async () => {
    if (!isWalletConnected || !address) { toast.error("Connect your wallet first"); return; }
    if (!vaultPda) { toast.error("Vault not available"); return; }
    const walletAdapter = getWalletAdapter();
    if (!walletAdapter) { toast.error("Wallet not connected"); return; }

    setIsExecuting(true);
    try {
      let anyOk = false;
      for (const vt of ["base", "quote"] as const) {
        try {
          const tx = await sdkRedeem(walletAdapter, vaultPda, vt);
          await signAndSend(tx);
          anyOk = true;
        } catch { /* skip if nothing to redeem on this side */ }
      }
      if (!anyOk) {
        toast.error("Nothing to redeem on this market.");
        return;
      }
      toast.success("Tokens redeemed!");
      // Flip to done state — gated on `anyOk` above so a complete
      // failure (every side errored) keeps the button actionable.
      setRedeemed(true);
      recordTrade("redeem", 0, "", "");
      onTradeExecuted?.();
      fetchBalances(); fetchWalletBalances();
      setTimeout(() => { fetchBalances(); fetchWalletBalances(); }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Redeem failed");
    } finally {
      setIsExecuting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  const selectedOpt = options[selectedOption];

  return (
    <div className={`font-mono ${className}`}>
      {/* Tab selector */}
      <div className="flex gap-0 mb-3 border border-[#2A3040]">
        {([...(!isFinalized ? ["trade"] : ["redeem"]), "chat", "history"] as TradeTab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-all cursor-pointer ${
              tab === t
                ? "bg-[#F25C05]/10 text-[#F25C05] border-b-2 border-[#F25C05]"
                : "text-[#A0A3A9] hover:text-[#B0B3B8]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* No separate vault toggle line — it's in the amount input */}

      {/* Option selector (swap tab) */}
      {tab === "trade" && (
        <>
          <div className="mb-3">
            <p className="text-[10px] text-[#A0A3A9] uppercase tracking-widest mb-1.5">SELECT OPTION</p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((opt) => (
                <button
                  key={opt.index}
                  onClick={() => setSelectedOption(opt.index)}
                  className={`text-xs px-2.5 py-1.5 border transition-all cursor-pointer ${
                    selectedOption === opt.index
                      ? "border-[#F25C05] text-[#F25C05] bg-[#F25C05]/10"
                      : "border-[#2A3040] text-[#B0B3B8] hover:border-[#444B57]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* BUY / SELL */}
          <div className="flex gap-0 mb-3">
            <button onClick={() => setSide("BUY")} className={`flex-1 py-1.5 text-xs font-bold uppercase transition-all cursor-pointer ${side === "BUY" ? "bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/40" : "bg-transparent text-[#A0A3A9] border border-[#2A3040]"}`}>BUY</button>
            <button onClick={() => setSide("SELL")} className={`flex-1 py-1.5 text-xs font-bold uppercase transition-all cursor-pointer ${side === "SELL" ? "bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40" : "bg-transparent text-[#A0A3A9] border border-[#2A3040]"}`}>SELL</button>
          </div>
        </>
      )}

      {/* Amount input (trade tab only) */}
      {tab === "trade" && (
        <>
          <div className="mb-2">
            <div className="flex items-center border border-[#2A3040] focus-within:border-[#F25C05]/50 transition-colors">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-[#F5F5F6] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-[#A0A3A9] px-3">
                {side === "SELL" ? selectedOpt?.label || baseSymbol : quoteSymbol}
              </span>
            </div>
          </div>
          <div className="flex gap-1.5 mb-3">
            {QUICK_AMOUNTS.map((qa) => (
              <button key={qa} onClick={() => setAmount(qa)} className="text-[10px] px-2 py-1 border border-[#2A3040] text-[#A0A3A9] hover:border-[#F25C05]/40 hover:text-[#F25C05] transition-all cursor-pointer">{qa}</button>
            ))}
            {(isWalletConnected || isCustodial) && (
              <button
                onClick={() => {
                  let max = 0;
                  if (side === "BUY") {
                    // BUY: use wallet USDC balance (auto-deposit will handle vault)
                    max = walletBalances.quote;
                    // Also add any existing vault balance
                    const condBal = balances?.quote?.condBalances?.[selectedOption];
                    if (condBal) max += condBal.toNumber() / 10 ** quoteDecimals;
                  } else {
                    // SELL: use vault conditional token balance (already deposited)
                    const condBal = balances?.base?.condBalances?.[selectedOption];
                    max = condBal ? condBal.toNumber() / 10 ** baseDecimals : 0;
                  }
                  if (max > 0) setAmount(max.toString());
                }}
                className="text-[10px] px-2 py-1 border border-[#F25C05]/30 text-[#F25C05] hover:bg-[#F25C05]/10 transition-all cursor-pointer font-bold"
              >
                MAX
              </button>
            )}
          </div>
        </>
      )}

      {/* Quote (swap only) */}
      {tab === "trade" && (quoteOutput || isQuoting) && (
        <div className="border border-dashed border-[#2A3040] p-2.5 mb-3 text-xs">
          {isQuoting ? (
            <span className="text-[#A0A3A9]">fetching quote...</span>
          ) : quoteOutput ? (
            <div className="flex justify-between">
              <span className="text-[#A0A3A9]">You {side === "BUY" ? "receive" : "get"}:</span>
              <span className="text-[#F5F5F6]">~{(Number(quoteOutput) / 10 ** (side === "BUY" ? baseDecimals : quoteDecimals)).toFixed(4)} {side === "BUY" ? selectedOpt?.label : quoteSymbol}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Chat tab */}
      {tab === "chat" && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
              <span className="text-[#555E6B]">
                {chatMessages.length} {chatMessages.length === 1 ? "msg" : "msgs"}
              </span>
              <span className="text-[#555E6B]">::</span>
              <button
                onClick={() => setChatSortOrder("newest")}
                className={`cursor-pointer transition-colors ${
                  chatSortOrder === "newest" ? "text-[#F25C05] underline" : "text-[#A0A3A9] hover:text-[#B0B3B8]"
                }`}
              >
                [newest]
              </button>
              <button
                onClick={() => setChatSortOrder("oldest")}
                className={`cursor-pointer transition-colors ${
                  chatSortOrder === "oldest" ? "text-[#F25C05] underline" : "text-[#A0A3A9] hover:text-[#B0B3B8]"
                }`}
              >
                [oldest]
              </button>
            </div>
            <button
              onClick={() => setIsChatExpanded(v => !v)}
              className="text-[10px] text-[#A0A3A9] hover:text-[#F25C05] uppercase tracking-widest cursor-pointer transition-colors"
              title={isChatExpanded ? "shrink chat area" : "expand chat area"}
            >
              {isChatExpanded ? "[− collapse]" : "[+ expand]"}
            </button>
          </div>
          <div className={`${isChatExpanded ? "max-h-[32rem]" : "max-h-72"} overflow-y-auto border border-[#2A3040] p-2 mb-2 space-y-1.5 transition-all`}>
            {chatMessages.length === 0 ? (
              <p className="text-xs text-[#A0A3A9] text-center py-4">{"// no messages yet //"}</p>
            ) : (
              (chatSortOrder === "newest" ? chatMessages.slice().reverse() : chatMessages).map((m) => {
                const walletShort = m.wallet ? `${m.wallet.slice(0, 4)}...${m.wallet.slice(-4)}` : "anon";
                const profile = chatUsernames[m.wallet] || undefined;
                const time = new Date(m.created_at);
                const timeStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " " + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isMe = senderAddress && m.wallet === senderAddress;
                return (
                  <div key={m.id} className="text-[10px] py-1 border-b border-[#2A3040]/50 last:border-b-0">
                    <div className="flex items-center justify-between mb-0.5 gap-2">
                      <span className="flex items-center gap-1 min-w-0">
                        <WalletProfileBadge
                          wallet={m.wallet}
                          profile={profile ?? undefined}
                          fallbackLabel={walletShort}
                          suffix={isMe ? " (you)" : undefined}
                          className={`font-bold ${isMe ? "text-[#F25C05]" : "text-[#B0B3B8]"}`}
                        />
                        {profile?.username ? (
                          <span className="text-[#555E6B] font-normal">({walletShort})</span>
                        ) : null}
                      </span>
                      <span className="text-[#555E6B] shrink-0">{timeStr}</span>
                    </div>
                    <p className="text-[#F5F5F6] break-words whitespace-pre-wrap">{m.content}</p>
                  </div>
                );
              })
            )}
          </div>
          {senderAddress ? (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                maxLength={500}
                placeholder="type a message..."
                disabled={isSendingChat}
                className="flex-1 bg-transparent border border-[#2A3040] px-2 py-1.5 text-xs text-[#F5F5F6] placeholder:text-[#555E6B] focus:border-[#F25C05] focus:outline-none"
              />
              <button
                onClick={handleSendChat}
                disabled={isSendingChat || !chatInput.trim()}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase border transition-all ${
                  isSendingChat || !chatInput.trim()
                    ? "border-[#2A3040] text-[#555E6B] cursor-not-allowed"
                    : "border-[#F25C05]/50 text-[#F25C05] hover:bg-[#F25C05]/10 cursor-pointer"
                }`}
              >
                {isSendingChat ? "..." : "send"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#A0A3A9] text-center py-2 border border-dashed border-[#2A3040]">{"// connect wallet to chat //"}</p>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="max-h-72 overflow-y-auto">
          {tradeHistory.length === 0 ? (
            <p className="text-xs text-[#A0A3A9] text-center py-4">{"// no trades yet //"}</p>
          ) : (
            <div className="space-y-1.5">
              {tradeHistory.map((t, i) => {
                const time = new Date(t.timestamp);
                const timeStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " " + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const walletShort = t.wallet ? `${t.wallet.slice(0, 4)}...${t.wallet.slice(-4)}` : "";
                const actionColor = t.action === "deposit" ? "text-[#3B82F6]"
                  : t.action === "trade" && t.side === "BUY" ? "text-[#22C55E]"
                  : t.action === "trade" && t.side === "SELL" ? "text-[#EF4444]"
                  : t.action === "withdraw" ? "text-[#F25C05]"
                  : t.action === "redeem" ? "text-[#A855F7]"
                  : "text-[#A0A3A9]";
                const label = t.action === "trade"
                  ? `${t.side} ${t.option_label || ""}`
                  : t.action.toUpperCase();
                // Compute equivalent using current spot price
                const isQuoteToken = t.token?.toUpperCase() === quoteSymbol?.toUpperCase();
                const matchedOption = t.option_label ? options.find(o => o.label === t.option_label) : null;
                const spotPrice = matchedOption?.spotPrice ?? null;
                let equivalent: string | null = null;
                if (t.amount > 0 && spotPrice && spotPrice > 0) {
                  if (isQuoteToken) {
                    // USDC → show equivalent in tokens
                    const tokenEquiv = t.amount / spotPrice;
                    if (tokenEquiv >= 0.01) equivalent = `(~${tokenEquiv.toFixed(2)} ${matchedOption?.label || baseSymbol})`;
                  } else if (t.token && matchedOption) {
                    // Option token → show $ equivalent
                    const dollarEquiv = t.amount * spotPrice;
                    if (dollarEquiv >= 0.01) equivalent = `($${dollarEquiv.toFixed(2)})`;
                  }
                }
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px] py-1 border-b border-[#2A3040]/50">
                    <span className="text-[#555E6B] w-28 shrink-0">{timeStr}</span>
                    <span className={`font-bold w-20 shrink-0 ${actionColor}`}>{label}</span>
                    <span className="text-[#F5F5F6] flex-1 text-right font-mono">
                      {t.amount > 0 ? t.amount.toFixed(2) : ""} {t.token || ""}
                      {equivalent && (
                        <span className="text-[#555E6B] ml-1">{equivalent}</span>
                      )}
                    </span>
                    {/* Trader column — handle when known, address otherwise.
                        Bonus (private) wallet trades intentionally show
                        only the address: those wallets are an internal
                        admin-funded surface and attaching a public Twitter
                        handle to them would leak which accounts received
                        bonus credit. */}
                    {t.twitter_username && t.wallet_type !== "private" ? (
                      <a
                        href={`https://x.com/${t.twitter_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400/80 hover:text-sky-300 truncate w-28 text-right"
                        title={t.wallet}
                      >
                        @{t.twitter_username}
                      </a>
                    ) : (
                      <span className="text-[#555E6B] w-20 text-right" title={t.wallet}>{walletShort}</span>
                    )}
                    {t.tx_signature && (
                      <a href={`https://solscan.io/tx/${t.tx_signature}`} target="_blank" rel="noopener noreferrer" className="text-[#F25C05] hover:underline shrink-0">
                        tx
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Action button */}
      {tab !== "history" && tab !== "chat" && (!(isWalletConnected || isCustodial) ? (
        <div className="text-center py-3 space-y-2 border border-dashed border-[#2A3040]">
          <p className="text-xs text-[#A0A3A9]">{"// connect to trade //"}</p>
          {!twitterProfile?.xConnected ? (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                // Trigger X OAuth — redirect to /api/twitter-oauth-url
                (async () => {
                  try {
                    const { generateCodeVerifier, generateCodeChallenge, generateState } = await import("@/components/Ideas/utils");
                    const codeVerifier = generateCodeVerifier();
                    const codeChallenge = await generateCodeChallenge(codeVerifier);
                    const state = generateState();
                    localStorage.setItem("twitter_code_verifier", codeVerifier);
                    localStorage.setItem("twitter_oauth_state", state);
                    localStorage.setItem("twitter_oauth_timestamp", Date.now().toString());
                    localStorage.setItem("twitter_oauth_return_path", window.location.pathname);
                    // Use /ideas as redirect_uri (registered with Twitter) — useIdeasAuth will handle
                    // the token exchange and redirect back to the hackathon page via return_path
                    const redirectUri = `${window.location.origin}/ideas`;
                    const res = await fetch("/api/twitter-oauth-url", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ redirect_uri: redirectUri, state, code_challenge: codeChallenge, code_challenge_method: "S256" }),
                    });
                    const data = await res.json();
                    if (data.authUrl) window.location.href = data.authUrl;
                  } catch { toast.error("Failed to connect X"); }
                })();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#F5F5F6] bg-[#1DA1F2]/10 border border-[#1DA1F2]/30 hover:bg-[#1DA1F2]/20 transition-colors"
            >
              𝕏 Connect with X to trade
            </a>
          ) : custodialChecked && !custodialWallet ? (
            <p className="text-[10px] text-[#555E6B]">No trading wallet assigned to @{twitterProfile.xUsername}</p>
          ) : null}
        </div>
      ) : (
        <button
          onClick={tab === "trade" ? handleTrade : handleRedeem}
          disabled={
            isExecuting ||
            (tab === "trade" && (!amount || parseFloat(amount) <= 0)) ||
            (tab === "redeem" && redeemed)
          }
          className={`w-full py-2.5 text-xs font-bold uppercase transition-all cursor-pointer ${
            isExecuting ||
            (tab === "trade" && (!amount || parseFloat(amount) <= 0)) ||
            (tab === "redeem" && redeemed)
              ? "border border-[#2A3040] text-[#444B57]"
              : tab === "trade" && side === "BUY" ? "border border-[#22C55E]/50 text-[#22C55E] hover:bg-[#22C55E]/10"
              : tab === "trade" ? "border border-[#EF4444]/50 text-[#EF4444] hover:bg-[#EF4444]/10"
              : "border border-[#A855F7]/50 text-[#A855F7] hover:bg-[#A855F7]/10"
          }`}
        >
          {isExecuting
            ? "EXECUTING..."
            : tab === "trade"
            ? `>> [ ${side} ${selectedOpt?.label || ""} ] <<`
            : redeemed
            ? ">> [ TOKENS REDEEMED ✓ ] <<"
            : ">> [ REDEEM WINNINGS ] <<"
          }
        </button>
      ))}

      {/* Balances */}
      {(isWalletConnected || isCustodial) && balances && (
        <div className="mt-3 pt-3 border-t border-[#2A3040]">
          <p className="text-[10px] text-[#A0A3A9] uppercase tracking-widest mb-2">YOUR BALANCES</p>

          {/* Regular balances */}
          <div className="flex gap-4 text-[10px] text-[#B0B3B8] mb-2">
            <span>
              <span className="text-[#A0A3A9]">{quoteSymbol}:</span>{" "}
              {balances.quote?.userBalance ? (balances.quote.userBalance.toNumber() / 10 ** quoteDecimals).toFixed(2) : "0.00"}
            </span>
            <span>
              <span className="text-[#A0A3A9]">{baseSymbol}:</span>{" "}
              {balances.base?.userBalance ? (balances.base.userBalance.toNumber() / 10 ** baseDecimals).toFixed(2) : "0.00"}
            </span>
          </div>

          {/* Conditional balances per option */}
          {(balances.quote?.condBalances?.length || balances.base?.condBalances?.length) && (
            <div className="space-y-1">
              {options.map((opt, i) => {
                const qBal = balances.quote?.condBalances?.[i];
                const bBal = balances.base?.condBalances?.[i];
                const qVal = qBal ? (qBal.toNumber() / 10 ** quoteDecimals).toFixed(2) : "0.00";
                const bVal = bBal ? (bBal.toNumber() / 10 ** baseDecimals).toFixed(2) : "0.00";
                const hasBalance = (qBal && !qBal.isZero()) || (bBal && !bBal.isZero());
                return (
                  <div key={opt.index} className={`flex items-center justify-between text-[10px] py-0.5 ${hasBalance ? "text-[#F5F5F6]" : "text-[#555E6B]"}`}>
                    <span className="text-[#A0A3A9]">{opt.label}:</span>
                    <span className="font-mono">
                      {qVal} <span className="text-[#555E6B]">{quoteSymbol}</span>
                      {" / "}
                      {bVal} <span className="text-[#555E6B]">{baseSymbol}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fallback link */}
      {tradeUrl && (
        <a href={tradeUrl} target="_blank" rel="noopener noreferrer" className="block text-center text-[10px] text-[#A0A3A9] hover:text-[#F25C05] transition-colors mt-3">
          {">"} or trade on combinator.trade
        </a>
      )}
    </div>
  );
}
