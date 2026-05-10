// InvestmentSectionVault for Agent Projects - same UI as Ideas (on-chain vault, progress, recent investors, modals)

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  DollarSign,
  Wallet,
  Loader2,
  X,
  Users,
  Shield,
  ExternalLink,
  Info,
  ArrowDownToLine,
  TrendingUp,
} from "lucide-react";
import { AgentProject, AgentProjectInvestment } from "./types";
import type { UserProfile } from "../Ideas";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getVaultPda,
  vaultExists,
  getVaultData,
  getUserDepositData,
  createInitializeVaultTransaction,
  createDepositTransaction,
  createWithdrawTransaction,
  getUsdcBalance,
  utils,
  RPC_URLS,
  type Network,
} from "shared/solana/sparkVaultService";

const NETWORK: Network = (import.meta.env.VITE_SOLANA_NETWORK as Network) || "devnet";
const RPC_URL = RPC_URLS[NETWORK];

interface InvestmentSectionVaultProps {
  project: AgentProject;
  userProfile: UserProfile;
  onConnectWallet: () => void;
  isConnectingWallet: boolean;
  onInvestmentSuccess?: () => void;
}

export function InvestmentSectionVault({
  project,
  userProfile,
  onConnectWallet,
  isConnectingWallet,
  onInvestmentSuccess,
}: InvestmentSectionVaultProps) {
  const { signTransaction: adapterSignTransaction, publicKey: adapterPublicKey, connected: adapterConnected } = useWallet();

  const [investments, setInvestments] = useState<AgentProjectInvestment[]>([]);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [userInvestments, setUserInvestments] = useState<AgentProjectInvestment[]>([]);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultInitialized, setVaultInitialized] = useState(false);
  const [userOnChainDeposit, setUserOnChainDeposit] = useState(0);
  const [vaultTotalDeposited, setVaultTotalDeposited] = useState(0);
  const [isLoadingVault, setIsLoadingVault] = useState(true);

  const goal = project.estimated_price || 25000;
  const raised = vaultTotalDeposited || project.raised_amount || 0;
  const progress = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const remaining = Math.max(0, goal - raised);

  const getConnection = useCallback(() => new Connection(RPC_URL, "confirmed"), []);

  const loadVaultData = useCallback(async () => {
    setIsLoadingVault(true);
    try {
      const connection = getConnection();
      const [vaultPda] = await getVaultPda(project.id);
      setVaultAddress(vaultPda.toBase58());
      const exists = await vaultExists(connection, project.id);
      setVaultInitialized(exists);
      if (exists) {
        const vaultData = await getVaultData(connection, project.id);
        if (vaultData) setVaultTotalDeposited(utils.baseUnitsToUsdc(vaultData.totalDeposited));
        if (userProfile.walletAddress) {
          const userDeposit = await getUserDepositData(
            connection,
            project.id,
            new PublicKey(userProfile.walletAddress)
          );
          setUserOnChainDeposit(userDeposit ? utils.baseUnitsToUsdc(userDeposit.amount) : 0);
        }
      }
    } catch (e) {
      console.error("Failed to load vault:", e);
    } finally {
      setIsLoadingVault(false);
    }
  }, [project.id, userProfile.walletAddress, getConnection]);

  const loadInvestments = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent-project-investments?projectId=${project.id}`);
      if (res.ok) {
        const data = await res.json();
        const list = (data.investments || []) as AgentProjectInvestment[];
        setInvestments(list);
        if (userProfile.walletAddress) {
          setUserInvestments(list.filter((i) => i.investor_wallet === userProfile.walletAddress));
        } else {
          setUserInvestments([]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch investments:", e);
    }
  }, [project.id, userProfile.walletAddress]);

  const loadUsdcBalance = useCallback(async () => {
    if (!userProfile.walletAddress || !userProfile.walletConnected) {
      setUsdcBalance(null);
      return;
    }
    setIsLoadingBalance(true);
    try {
      const connection = getConnection();
      const result = await getUsdcBalance(
        connection,
        new PublicKey(userProfile.walletAddress),
        NETWORK
      );
      setUsdcBalance(result.balance);
    } catch (e) {
      console.error("Failed to fetch USDC balance:", e);
      setUsdcBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [userProfile.walletAddress, userProfile.walletConnected, getConnection]);

  useEffect(() => {
    loadVaultData();
    loadInvestments();
  }, [loadVaultData, loadInvestments]);

  useEffect(() => {
    loadUsdcBalance();
  }, [loadUsdcBalance, showDepositModal]);

  const getConnectedWalletProvider = (): { signTransaction: (tx: unknown) => Promise<unknown> } => {
    const addr = userProfile.walletAddress;
    if (!addr) throw new Error("Connect your wallet first.");

    // Primary: Use wallet adapter (supports all Standard Wallets including Jupiter)
    if (adapterConnected && adapterSignTransaction && adapterPublicKey?.toString() === addr) {
      return { signTransaction: adapterSignTransaction as (tx: unknown) => Promise<unknown> };
    }

    // Fallback: Check window globals for legacy wallet providers
    const phantom = (window as unknown as { phantom?: { solana?: { publicKey?: { toString: () => string }; signTransaction: (tx: unknown) => Promise<unknown> } } }).phantom?.solana;
    if (phantom?.publicKey?.toString() === addr) return phantom;
    const backpack = (window as unknown as { backpack?: { publicKey?: { toString: () => string }; signTransaction: (tx: unknown) => Promise<unknown> } }).backpack;
    if (backpack?.publicKey?.toString() === addr) return backpack;
    const solflare = (window as unknown as { solflare?: { publicKey?: { toString: () => string }; signTransaction: (tx: unknown) => Promise<unknown> } }).solflare;
    if (solflare?.publicKey?.toString() === addr) return solflare;
    throw new Error("No compatible wallet found. Please reconnect your wallet.");
  };

  const handleInitializeVault = async (): Promise<boolean> => {
    if (!userProfile.walletAddress) return false;
    setIsInitializing(true);
    try {
      const provider = getConnectedWalletProvider();
      const connection = getConnection();
      const payerPublicKey = new PublicKey(userProfile.walletAddress);
      const transaction = await createInitializeVaultTransaction(connection, payerPublicKey, project.id, NETWORK);
      const signedTx = await provider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction((signedTx as { serialize: () => Buffer }).serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(String(confirmation.value.err));
      setVaultInitialized(true);
      await loadVaultData();
      return true;
    } catch (e) {
      console.error("Initialize vault failed:", e);
      toast.error(e instanceof Error ? e.message : "Failed to initialize vault.");
      return false;
    } finally {
      setIsInitializing(false);
    }
  };

  const handleDeposit = async () => {
    if (!userProfile.walletAddress || !depositAmount) return;
    if (!utils.isValidUsdcAmount(depositAmount)) {
      toast.error("Invalid USDC amount.");
      return;
    }
    const parsedAmount = parseFloat(depositAmount);
    if (parsedAmount < 0.001) {
      toast.error("Minimum deposit is 0.001 USDC");
      return;
    }
    if (usdcBalance != null && parsedAmount > usdcBalance) {
      toast.error(`Insufficient balance. You have ${usdcBalance.toFixed(2)} USDC`);
      return;
    }
    if (!vaultInitialized) {
      const ok = await handleInitializeVault();
      if (!ok) return;
    }
    setIsDepositing(true);
    setTxSignature(null);
    try {
      const provider = getConnectedWalletProvider();
      const connection = getConnection();
      const userPublicKey = new PublicKey(userProfile.walletAddress);
      const amountInBaseUnits = utils.usdcToBaseUnits(depositAmount);
      const transaction = await createDepositTransaction(connection, userPublicKey, project.id, amountInBaseUnits, NETWORK);
      const signedTx = await provider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction((signedTx as { serialize: () => Buffer }).serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(String(confirmation.value.err));
      setTxSignature(signature);
      await fetch("/api/agent-project-investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          investorWallet: userProfile.walletAddress,
          amountUsdc: parsedAmount,
          transactionSignature: signature,
        }),
      });
      await loadVaultData();
      await loadInvestments();
      await loadUsdcBalance();
      setShowDepositModal(false);
      setDepositAmount("");
      onInvestmentSuccess?.();
    } catch (e) {
      console.error("Deposit failed:", e);
      toast.error(e instanceof Error ? e.message : "Deposit failed.");
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!userProfile.walletAddress || !withdrawAmount) return;
    if (!utils.isValidUsdcAmount(withdrawAmount)) {
      toast.error("Invalid amount.");
      return;
    }
    const parsedAmount = parseFloat(withdrawAmount);
    if (parsedAmount > userOnChainDeposit) {
      toast.error(`You cannot withdraw more than ${userOnChainDeposit.toFixed(2)} USDC`);
      return;
    }
    setIsWithdrawing(true);
    setTxSignature(null);
    try {
      const provider = getConnectedWalletProvider();
      const connection = getConnection();
      const userPublicKey = new PublicKey(userProfile.walletAddress);
      const amountInBaseUnits = utils.usdcToBaseUnits(withdrawAmount);
      const transaction = await createWithdrawTransaction(connection, userPublicKey, project.id, amountInBaseUnits, NETWORK);
      const signedTx = await provider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction((signedTx as { serialize: () => Buffer }).serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(String(confirmation.value.err));
      setTxSignature(signature);
      const isFullWithdrawal = parsedAmount >= userOnChainDeposit - 0.001;
      if (isFullWithdrawal && userInvestments.length > 0) {
        for (const inv of userInvestments) {
          if (inv.status === "active") {
            try {
              await fetch("/api/agent-project-investments", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: inv.id, action: "refund" }),
              });
            } catch (err) {
              console.error("Failed to update investment status:", err);
            }
          }
        }
      }
      await loadVaultData();
      await loadInvestments();
      await loadUsdcBalance();
      setShowWithdrawModal(false);
      setWithdrawAmount("");
    } catch (e) {
      console.error("Withdraw failed:", e);
      toast.error(e instanceof Error ? e.message : "Withdraw failed.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const explorerUrl = "https://solscan.io";
  const explorerSuffix = NETWORK === "devnet" ? "?cluster=devnet" : "";

  const investorCount = new Set(investments.filter((i) => i.status === "active").map((i) => i.investor_wallet)).size;
  const activeInvestments = investments.filter((i) => i.status === "active");
  const aggregatedByWallet = activeInvestments.reduce(
    (acc, inv) => {
      const w = inv.investor_wallet;
      if (!acc[w]) acc[w] = { wallet: w, totalAmount: 0 };
      acc[w].totalAmount += inv.amount_usdc;
      return acc;
    },
    {} as Record<string, { wallet: string; totalAmount: number }>
  );
  const uniqueInvestors = Object.values(aggregatedByWallet);

  return (
    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/5 to-emerald-600/10 border border-emerald-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Investment Round</h4>
            <p className="text-[10px] text-neutral-500">On-chain vault (USDC)</p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-[9px] font-medium text-yellow-400 uppercase">{NETWORK}</span>
        </div>
      </div>

      {vaultAddress && (
        <div className="mb-4 p-2 rounded-lg bg-neutral-900/30 border border-neutral-800">
          <div className="flex items-center gap-2">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-neutral-400">Vault Address:</span>
            <a
              href={`${explorerUrl}/address/${vaultAddress}${explorerSuffix}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono"
            >
              {vaultAddress.slice(0, 8)}...{vaultAddress.slice(-8)}
              <ExternalLink className="w-2.5 h-2.5 inline ml-1" />
            </a>
          </div>
          {!vaultInitialized && !isLoadingVault && (
            <p className="text-[9px] text-yellow-400 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Vault not initialized yet. First deposit will create it.
            </p>
          )}
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-neutral-400">Progress</span>
          <span className="text-xs font-semibold text-emerald-400">{progress.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-neutral-800/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-lg bg-neutral-900/30">
          <p className="text-sm font-bold text-emerald-400">${raised.toLocaleString()}</p>
          <p className="text-[9px] text-neutral-500 uppercase">Raised</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-neutral-900/30">
          <p className="text-sm font-bold text-white">${goal.toLocaleString()}</p>
          <p className="text-[9px] text-neutral-500 uppercase">Goal</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-neutral-900/30">
          <p className="text-sm font-bold text-orange-400">{investorCount}</p>
          <p className="text-[9px] text-neutral-500 uppercase">Investors</p>
        </div>
      </div>

      {userProfile.walletConnected && userOnChainDeposit > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-emerald-400 uppercase mb-1">Your On-Chain Balance</p>
              <p className="text-lg font-bold text-white">${userOnChainDeposit.toLocaleString()} USDC</p>
            </div>
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-medium hover:bg-orange-500/30 transition-colors"
            >
              <ArrowDownToLine className="w-3 h-3" />
              Withdraw
            </button>
          </div>
        </div>
      )}

      {!userProfile.walletConnected ? (
        <button
          onClick={onConnectWallet}
          disabled={isConnectingWallet}
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-black font-semibold text-sm rounded-lg hover:bg-emerald-400 disabled:opacity-50"
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
          disabled={isLoadingVault}
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-black font-semibold text-sm rounded-lg hover:bg-emerald-400 disabled:opacity-50"
        >
          {isLoadingVault ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <DollarSign className="w-4 h-4" />
              {userOnChainDeposit > 0 ? "Invest More" : "Invest Now"}
            </>
          )}
        </button>
      )}

      {uniqueInvestors.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3 h-3 text-neutral-500" />
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Recent Investors</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {uniqueInvestors.slice(0, 5).map((inv, i) => (
              <div
                key={i}
                className="px-2 py-1 rounded-lg bg-neutral-800/50 text-[10px] text-neutral-400"
                title={inv.wallet}
              >
                {inv.wallet.slice(0, 4)}...{inv.wallet.slice(-4)} • ${inv.totalAmount}
              </div>
            ))}
            {uniqueInvestors.length > 5 && (
              <div className="px-2 py-1 rounded-lg bg-neutral-800/50 text-[10px] text-neutral-500">
                +{uniqueInvestors.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {showDepositModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDepositModal(false)} />
          <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-neutral-900/95 border border-emerald-500/20 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-white">Invest USDC</h3>
              <button onClick={() => setShowDepositModal(false)} className="text-neutral-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mb-4 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-[10px] text-yellow-400 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Using {NETWORK.toUpperCase()} network. Make sure your wallet is on {NETWORK}.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-neutral-400 uppercase mb-1.5 block">Amount (USDC)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Enter amount..."
                    min="0.01"
                    step="0.01"
                    className="w-full h-12 pl-9 pr-20 bg-neutral-800/50 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  {userProfile.walletConnected && usdcBalance != null && usdcBalance > 0 && (
                    <button
                      onClick={() => setDepositAmount(Math.min(remaining, usdcBalance).toFixed(2))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 rounded border border-emerald-500/30"
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-neutral-500">Remaining: ${remaining.toLocaleString()} USDC</p>
                  {usdcBalance != null && (
                    <p className="text-[10px] text-neutral-500">Balance: ${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-[10px] text-blue-400">
                  <Shield className="w-3 h-3 inline mr-1" />
                  Your funds are secured in an on-chain vault. You can withdraw at any time.
                </p>
              </div>
              {txSignature && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-[10px] text-emerald-400 mb-1">Transaction sent!</p>
                  <a href={`${explorerUrl}/tx/${txSignature}${explorerSuffix}`} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1">
                    View on Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowDepositModal(false)} className="flex-1 py-2.5 text-neutral-400 text-sm font-medium hover:text-white">
                  Cancel
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={isDepositing || isInitializing || !depositAmount || parseFloat(depositAmount) <= 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-black font-semibold text-sm rounded-lg hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isDepositing || isInitializing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isInitializing ? "Creating Vault..." : "Processing..."}
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

      {showWithdrawModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowWithdrawModal(false)} />
          <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-neutral-900/95 border border-orange-500/20 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-white">Withdraw USDC</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="text-neutral-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-neutral-400 uppercase mb-1.5 block">Amount (USDC)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Enter amount..."
                    min="0.01"
                    max={userOnChainDeposit}
                    step="0.01"
                    className="w-full h-12 pl-9 pr-20 bg-neutral-800/50 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-orange-500/50"
                  />
                  {userOnChainDeposit > 0 && (
                    <button
                      onClick={() => setWithdrawAmount(userOnChainDeposit.toFixed(2))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium text-orange-400 hover:text-orange-300 bg-orange-500/10 rounded border border-orange-500/30"
                    >
                      Max
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Available: ${userOnChainDeposit.toLocaleString()} USDC</p>
              </div>
              {txSignature && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-[10px] text-emerald-400 mb-1">Withdrawal successful!</p>
                  <a href={`${explorerUrl}/tx/${txSignature}${explorerSuffix}`} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1">
                    View on Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowWithdrawModal(false)} className="flex-1 py-2.5 text-neutral-400 text-sm font-medium hover:text-white">
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > userOnChainDeposit}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-black font-semibold text-sm rounded-lg hover:bg-orange-400 disabled:opacity-50"
                >
                  {isWithdrawing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Confirm Withdrawal"
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
