/**
 * RedemptionSection — lets holders of a loser Ideacoin burn their tokens
 * against the redemption vault's USDG pot at the fixed rate set by the admin.
 *
 * The section only renders if a vault has been initialized for this idea
 * (i.e. `viewVault(idea.id)` returns non-null). Otherwise it stays hidden.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  Flame,
  Loader2,
  Lock,
  Wallet,
  ExternalLink,
  Timer,
  Info,
  ArrowRight,
} from "lucide-react";
import { Idea, UserProfile } from "./types";
import { useWalletContext } from "@/hooks/useWalletContext";
import {
  buildRedeem,
  prepareForSigning,
  rpcForCluster,
  sendAndConfirm,
  viewVault,
  VaultState,
  RedemptionCluster,
} from "@/services/redemptionVaultSdk";
import { getCustomTokenBalance } from "shared/solana/sparkVaultService";

interface RedemptionSectionProps {
  idea: Idea;
  userProfile: UserProfile;
  onConnectWallet: () => void;
  isConnectingWallet: boolean;
}

// The redemption vault program lives on devnet today.
// Reuse VITE_SOLANA_NETWORK so it Just Works when the program ships to mainnet.
const CLUSTER: RedemptionCluster =
  (import.meta.env.VITE_SOLANA_NETWORK as RedemptionCluster) || "devnet";

/** Parse a user-entered human amount (e.g. "1.5") into raw base units (bigint). */
function parseHumanToRaw(human: string, decimals: number): bigint | null {
  const s = human.trim();
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [intPart, fracPart = ""] = s.split(".");
  const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(intPart || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}

/** Format a raw u64 into a human string with `decimals` digits. */
function formatRaw(raw: string | number | bigint, decimals: number): string {
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  return (n / 10 ** decimals).toLocaleString(undefined, {
    maximumFractionDigits: Math.min(decimals, 6),
  });
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export function RedemptionSection({
  idea,
  userProfile,
  onConnectWallet,
  isConnectingWallet,
}: RedemptionSectionProps) {
  const { address, walletProvider, signTransaction, isWalletConnected } =
    useWalletContext();

  // ── Vault + user state ──
  const [vault, setVault] = useState<VaultState | null>(null);
  // The identifier that was used to create the vault (idea.id UUID OR idea.slug).
  // We resolve it at fetch time and reuse it for redeem.
  const [vaultIdeaId, setVaultIdeaId] = useState<string | null>(null);
  const [isLoadingVault, setIsLoadingVault] = useState(true);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // ── Redeem form ──
  const [amountHuman, setAmountHuman] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);

  // Live countdown — tick every second while redemption is open.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // Fetch vault for this idea. We try both idea.id (UUID) AND idea.slug, because
  // the back-office historically accepted a free-form id. Whichever one has a
  // vault on-chain wins; if both exist, the UUID takes priority.
  useEffect(() => {
    let cancelled = false;
    setIsLoadingVault(true);
    const candidates = Array.from(new Set([idea.id, idea.slug].filter(Boolean) as string[]));
    console.log(
      `[RedemptionSection] probing ${candidates.length} id(s) on cluster=${CLUSTER}:`,
      candidates
    );

    (async () => {
      for (const candidate of candidates) {
        try {
          const v = await viewVault(candidate, CLUSTER);
          console.log(`[RedemptionSection] viewVault("${candidate}") →`,
            v ? { pda: v.pda, tokenMint: v.tokenMint, closed: v.closed } : null);
          if (!cancelled && v) {
            setVault(v);
            setVaultIdeaId(candidate);
            return;
          }
        } catch (err) {
          console.error(`[RedemptionSection] viewVault("${candidate}") failed:`, err);
        }
      }
      if (!cancelled) {
        setVault(null);
        setVaultIdeaId(null);
      }
    })().finally(() => {
      if (!cancelled) setIsLoadingVault(false);
    });

    return () => {
      cancelled = true;
    };
  }, [idea.id, idea.slug]);

  // Fetch the connected user's balance of the loser token.
  const loadTokenBalance = useCallback(async () => {
    if (!vault || !userProfile.walletAddress) {
      setTokenBalance(null);
      return;
    }
    setIsLoadingBalance(true);
    try {
      const connection = new Connection(rpcForCluster(CLUSTER), "confirmed");
      const walletPk = new PublicKey(userProfile.walletAddress);
      const mintPk = new PublicKey(vault.tokenMint);
      const programPk = new PublicKey(vault.tokenProgramId);
      const res = await getCustomTokenBalance(connection, walletPk, mintPk, programPk);
      setTokenBalance(res.balance);
    } catch (err) {
      console.error("Error loading loser-token balance:", err);
      setTokenBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [vault, userProfile.walletAddress]);

  useEffect(() => {
    loadTokenBalance();
  }, [loadTokenBalance]);

  // Countdown ticker.
  useEffect(() => {
    if (!vault) return;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [vault]);

  // Derived values.
  const secondsLeft = vault ? vault.deadline - now : 0;
  const deadlinePassed = !!vault && secondsLeft <= 0;
  const isClosed = !!vault && vault.closed;

  const tokenDecimals = vault?.tokenDecimals ?? 9;
  const usdgDecimals = vault?.usdgDecimals ?? 6;

  const tokensInRaw = useMemo(
    () => parseHumanToRaw(amountHuman, tokenDecimals),
    [amountHuman, tokenDecimals]
  );

  const estUsdgRaw = useMemo(() => {
    if (!vault || !tokensInRaw) return null;
    try {
      return (tokensInRaw * BigInt(vault.rateNum)) / BigInt(vault.rateDen);
    } catch {
      return null;
    }
  }, [vault, tokensInRaw]);

  // 1 token → how many USDG? (display only)
  const humanRate = useMemo(() => {
    if (!vault) return null;
    const num = Number(vault.rateNum);
    const den = Number(vault.rateDen);
    if (den === 0) return null;
    // raw-USDG per raw-token × 10^tokDec / 10^usdgDec
    return (num / den) * 10 ** tokenDecimals / 10 ** usdgDecimals;
  }, [vault, tokenDecimals, usdgDecimals]);

  // Signing helpers — same pattern as RedemptionVaultManager.
  const signerAdapter = useCallback(() => {
    if (!address) throw new Error("Wallet not connected");
    return {
      publicKey: new PublicKey(address),
      // Anchor's builder only reads publicKey; no signing here.
      signTransaction: async <T,>(tx: T) => tx,
      signAllTransactions: async <T,>(txs: T[]) => txs,
    };
  }, [address]);

  const signAndSend = useCallback(
    async (tx: Transaction): Promise<string> => {
      if (!walletProvider) throw new Error("No wallet connected");
      const prepared = await prepareForSigning(tx, new PublicKey(address), CLUSTER);
      const signed = await signTransaction(prepared, walletProvider);
      if (!signed) throw new Error("User rejected signature");
      return sendAndConfirm(signed, CLUSTER);
    },
    [address, walletProvider, signTransaction]
  );

  const handleRedeem = async () => {
    if (!isWalletConnected) return toast.error("Connect your wallet first");
    if (!vault || !vaultIdeaId) return toast.error("Vault not loaded yet");
    if (deadlinePassed) return toast.error("Redemption deadline has passed");
    if (isClosed) return toast.error("This vault is closed");
    if (!tokensInRaw || tokensInRaw <= 0n)
      return toast.error("Enter a valid amount of tokens to burn");
    if (estUsdgRaw !== null && estUsdgRaw <= 0n)
      return toast.error("Amount too small — payout would round to 0 USDG");
    if (tokenBalance !== null && Number(tokensInRaw) / 10 ** tokenDecimals > tokenBalance)
      return toast.error(
        `Insufficient ${idea.ticker || "token"} balance (${tokenBalance.toLocaleString()})`
      );

    setIsRedeeming(true);
    setLastTxSig(null);
    try {
      const tokenProgram =
        vault.tokenProgramId === TOKEN_2022_PROGRAM_ID.toBase58()
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID;

      const tx = await buildRedeem(
        signerAdapter() as any,
        {
          ideaId: vaultIdeaId,
          tokensIn: new BN(tokensInRaw.toString()),
          tokenProgram,
        },
        CLUSTER
      );
      const sig = await signAndSend(tx);
      setLastTxSig(sig);
      toast.success(`Redeemed ${formatRaw(estUsdgRaw ?? 0, usdgDecimals)} USDG`);
      setAmountHuman("");
      // Refresh vault + balance.
      const fresh = await viewVault(vaultIdeaId, CLUSTER);
      setVault(fresh);
      await loadTokenBalance();
    } catch (err) {
      console.error("Redeem failed:", err);
      const msg = err instanceof Error ? err.message : "Redeem failed";
      toast.error(msg);
    } finally {
      setIsRedeeming(false);
    }
  };

  // ── Render guards ──

  // Still loading — reserve no vertical space (hide to avoid flicker on ideas without a vault).
  if (isLoadingVault) return null;
  // No vault exists for this idea — show a dev diagnostic so we can see *why* nothing appears.
  if (!vault) {
    if (import.meta.env.DEV) {
      return (
        <div className="p-3 rounded-2xl bg-neutral-900/50 border border-neutral-700/40 text-[11px] font-geist text-neutral-400">
          <div className="font-bold text-neutral-300 mb-1">
            Redemption: no vault found (dev only)
          </div>
          <div className="break-all">
            idea.id: <code>{idea.id}</code>
          </div>
          <div className="break-all">
            idea.slug: <code>{idea.slug}</code>
          </div>
          <div>
            cluster: <code>{CLUSTER}</code>
          </div>
          <div className="mt-1 text-neutral-500">
            Both ids were probed (see console). Create a vault via the back-office using one of
            these ids — the component will pick it up automatically.
          </div>
        </div>
      );
    }
    return null;
  }

  const explorerUrl = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;

  const remainingUsdg = formatRaw(vault.remainingUsdgRaw, usdgDecimals);
  const depositedUsdg = formatRaw(vault.totalUsdgDeposited, usdgDecimals);
  const claimedUsdg = formatRaw(vault.totalUsdgClaimed, usdgDecimals);
  const canRedeem = !deadlinePassed && !isClosed;

  return (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-orange-500/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h4 className="text-sm font-satoshi font-bold text-white">Token Redemption</h4>
            <p className="text-[10px] font-geist text-neutral-500">
              Burn your {idea.ticker || "tokens"} for USDG at a fixed rate
            </p>
          </div>
        </div>
        {CLUSTER !== "mainnet" && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 font-satoshi">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-[9px] font-medium text-yellow-400 uppercase">{CLUSTER}</span>
          </div>
        )}
      </div>

      {/* Countdown / state banner */}
      {isClosed ? (
        <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center justify-center gap-2">
            <Lock className="w-4 h-4 text-red-400" />
            <span className="text-xs font-satoshi font-medium text-red-400">
              Vault closed — remainder reclaimed by the authority.
            </span>
          </div>
        </div>
      ) : deadlinePassed ? (
        <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center justify-center gap-2">
            <Lock className="w-4 h-4 text-red-400" />
            <span className="text-xs font-satoshi font-medium text-red-400">
              Redemption window has closed.
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Timer className="w-4 h-4 text-orange-400" />
            <span className="text-[10px] font-satoshi font-medium text-orange-400 uppercase">
              Window closes in
            </span>
          </div>
          <div className="flex items-center justify-center gap-1 text-lg font-bold text-orange-300 font-mono">
            {formatCountdown(secondsLeft)}
          </div>
        </div>
      )}

      {/* Pool stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-2xl bg-white/[0.03]">
          <p className="text-sm font-satoshi font-bold text-orange-400">${remainingUsdg}</p>
          <p className="text-[9px] font-satoshi text-neutral-500 uppercase">USDG left</p>
        </div>
        <div className="text-center p-2 rounded-2xl bg-white/[0.03]">
          <p className="text-sm font-satoshi font-bold text-white">${depositedUsdg}</p>
          <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Pot size</p>
        </div>
        <div className="text-center p-2 rounded-2xl bg-white/[0.03]">
          <p className="text-sm font-satoshi font-bold text-white">${claimedUsdg}</p>
          <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Already claimed</p>
        </div>
      </div>

      {/* Rate */}
      {humanRate !== null && (
        <div className="mb-4 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between text-xs font-geist">
            <span className="text-neutral-400">Redemption rate</span>
            <span className="font-mono text-white">
              1 {idea.ticker || "TOKEN"}{" "}
              <ArrowRight className="inline w-3 h-3 text-neutral-500" />{" "}
              {humanRate.toLocaleString(undefined, { maximumFractionDigits: usdgDecimals })} USDG
            </span>
          </div>
        </div>
      )}

      {/* User balance */}
      {userProfile.walletConnected && tokenBalance !== null && (
        <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-satoshi text-emerald-400 uppercase mb-1">
                Your {idea.ticker || "token"} balance
              </p>
              <p className="text-lg font-satoshi font-bold text-white">
                {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                {idea.ticker || ""}
              </p>
            </div>
            {tokenBalance > 0 && (
              <button
                onClick={() => setAmountHuman(String(tokenBalance))}
                className="px-2 py-1 text-[10px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/30 transition-colors"
                disabled={!canRedeem}
              >
                Max
              </button>
            )}
          </div>
        </div>
      )}

      {/* Amount input + action */}
      {canRedeem && (
        <>
          <div className="mb-3">
            <label className="text-[10px] font-satoshi font-medium text-neutral-400 uppercase mb-1.5 block">
              Tokens to burn
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={amountHuman}
              onChange={(e) => setAmountHuman(e.target.value)}
              placeholder={`Amount of ${idea.ticker || "tokens"} to redeem`}
              className="w-full h-12 px-3 bg-white/[0.04] border border-white/[0.06] rounded-xl font-geist text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-orange-500/50"
              disabled={!isWalletConnected || isRedeeming}
            />
          </div>

          {/* Estimated payout */}
          {estUsdgRaw !== null && (
            <div className="mb-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs font-geist">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">You receive</span>
                <span className="font-mono text-orange-400 text-sm font-bold">
                  {formatRaw(estUsdgRaw, usdgDecimals)} USDG
                </span>
              </div>
              {estUsdgRaw <= 0n && (
                <div className="mt-1 text-[10px] text-red-400">
                  ⚠ Amount too small — payout rounds to 0 USDG.
                </div>
              )}
            </div>
          )}

          {/* Fee/burn disclaimer */}
          <div className="mb-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-[10px] font-geist text-neutral-400">
              <Info className="w-3 h-3 inline mr-1" />
              Burning is irreversible — your {idea.ticker || "tokens"} are permanently destroyed
              in exchange for USDG.
            </p>
          </div>

          {/* Action button */}
          {!userProfile.walletConnected ? (
            <button
              onClick={onConnectWallet}
              disabled={isConnectingWallet}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-orange-400 disabled:opacity-50"
            >
              {isConnectingWallet ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Connect wallet to redeem
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleRedeem}
              disabled={
                isRedeeming ||
                isLoadingBalance ||
                !tokensInRaw ||
                tokensInRaw <= 0n ||
                (estUsdgRaw !== null && estUsdgRaw <= 0n)
              }
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-orange-400 disabled:opacity-50"
            >
              {isRedeeming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Burning...
                </>
              ) : (
                <>
                  <Flame className="w-4 h-4" />
                  Burn & Redeem
                </>
              )}
            </button>
          )}

          {/* Last tx link */}
          {lastTxSig && (
            <div className="mt-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[10px] text-emerald-400 mb-1">Redemption successful!</p>
              <a
                href={explorerUrl(lastTxSig)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
              >
                View on Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RedemptionSection;
