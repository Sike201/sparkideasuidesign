/**
 * InvestmentSection avec integration Smart Contract
 *
 * Ce composant utilise le smart contract Spark Idea Vault pour gerer
 * les investissements on-chain. Les fonds vont dans un vault PDA unique
 * par idee, et les utilisateurs peuvent retirer leurs fonds a tout moment.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import confetti from "canvas-confetti";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  X,
  Loader2,
  Users,
  ExternalLink,
  ArrowDownToLine,
  Info,
  Lock,
  Timer,
  Rocket,
} from "lucide-react";
import { Idea, UserProfile } from "./types";
import { useWalletContext } from "@/hooks/useWalletContext";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  getVaultPda,
  getUserDepositPda,
  getVaultAta,
  vaultExists,
  getVaultData,
  getUserDepositData,
  createInitializeVaultTransaction,
  createDepositTransaction,
  createWithdrawTransaction,
  getTokenBalance,
  getCustomTokenBalance,
  getVaultBalance,
  utils,
  USDC_MINT,
  USDC_DECIMALS,
  RPC_URLS,
  type Network,
  type TokenType,
} from "shared/solana/sparkVaultService";

// Configuration - Use environment variable for network (defaults to devnet for safety)
const NETWORK: Network = (import.meta.env.VITE_SOLANA_NETWORK as Network) || "devnet";
const RPC_URL = RPC_URLS[NETWORK];

interface InvestmentSectionVaultProps {
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

export function InvestmentSectionVault({
  idea,
  userProfile,
  onConnectWallet,
  isConnectingWallet,
  onCommentPosted,
  jupiterPrice,
}: InvestmentSectionVaultProps) {
  // Wallet context (shared with hackathons)
  const { address: ctxAddress, walletState, signTransaction: ctxSignTransaction, walletProvider: ctxWalletProvider } = useWalletContext();

  // Token selection
  const [selectedToken, setSelectedToken] = useState<TokenType>("USDC");

  // State
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [netByWallet, setNetByWallet] = useState<Record<string, number> | null>(null);
  const [totalEverRaised, setTotalEverRaised] = useState<number | null>(null);
  const [totalInvestorCount, setTotalInvestorCount] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [userInvestments, setUserInvestments] = useState<InvestmentRecord[]>([]);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);
  const [investmentComment, setInvestmentComment] = useState("");
  const [investorEmail, setInvestorEmail] = useState("");
  const [touAccepted, setTouAccepted] = useState(false);
  const [userTouAlreadyAccepted, setUserTouAlreadyAccepted] = useState(false);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // On-chain project token balance (for funded ideas)
  const [projectTokenBalance, setProjectTokenBalance] = useState<number | null>(null);

  // Real airdrop allocation for the connected wallet, fetched from
  // /api/idea-allocation. Source of truth for "how many tokens did /
  // will I receive" — the prior `invested / initialTokenPrice` math
  // was a pool-price estimation that diverged from the actual
  // pro-rata allocation (typically by 2x: invested in $20 raise →
  // estimation said 5M tokens, actual airdrop was ~9.9M because
  // 99% × 10M airdrop pool gets fully distributed regardless of
  // raise size).
  const [userAllocationTokens, setUserAllocationTokens] = useState<number | null>(null);

  // Smart contract state (per token)
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultInitialized, setVaultInitialized] = useState(false);
  const [userOnChainDeposit, setUserOnChainDeposit] = useState<number>(0);
  const [usdcVaultTotal, setUsdcVaultTotal] = useState<number>(0);
  const [usdgVaultTotal, setUsdgVaultTotal] = useState<number>(0);
  const [isLoadingVault, setIsLoadingVault] = useState(true);

  // Backward compat alias
  const usdcBalance = selectedToken === "USDC" ? tokenBalance : null;

  const goal = idea.estimatedPrice || 0;
  const vaultTotalDeposited = usdcVaultTotal + usdgVaultTotal;
  const netByWalletTotal = netByWallet ? Object.values(netByWallet).reduce((sum, v) => sum + v, 0) : null;
  // Use totalEverRaised (all non-refunded investments) as fallback when net active is 0 (post-launch)
  const HARDCODED_RAISED: Record<string, { raised: number; investors: number }> = {
    'e03ef91e-958d-41d6-bff9-1e1cc644f29e': { raised: 4079.32, investors: 18 },
  };
  const hardcoded = HARDCODED_RAISED[idea.id];
  const raised = hardcoded?.raised ?? (netByWalletTotal || totalEverRaised || idea.raisedAmount || 0);
  const progress = goal > 0 ? (raised / goal) * 100 : 0;
  const remaining = Math.max(0, goal - raised);

  // Cap reached logic
  const capReached = raised >= goal && goal > 0;
  const [localCapReachedAt, setLocalCapReachedAt] = useState<Date | null>(null);
  const capReachedAt = idea.capReachedAt ? new Date(idea.capReachedAt) : localCapReachedAt;
  const capDeadlineTime = capReachedAt ? capReachedAt.getTime() + 24 * 60 * 60 * 1000 : null;
  const capDeadline = capDeadlineTime ? new Date(capDeadlineTime) : null;
  const [now, setNow] = useState(() => new Date());
  const investmentClosed = capDeadline ? now > capDeadline : false;

  // When cap is reached but no DB timestamp yet, set a local fallback
  useEffect(() => {
    if (capReached && !idea.capReachedAt && !localCapReachedAt) {
      setLocalCapReachedAt(new Date());
    }
  }, [capReached, idea.capReachedAt, localCapReachedAt]);

  // Fetch user data to check if email + TOU already accepted
  useEffect(() => {
    if (!userProfile.walletAddress) return;
    fetch(`/api/user?address=${userProfile.walletAddress}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.email && data.tou_accepted_at) {
          setInvestorEmail(data.email);
          setTouAccepted(true);
          setUserTouAlreadyAccepted(true);
        } else if (data.email) {
          setInvestorEmail(data.email);
        }
      })
      .catch(() => { });
  }, [userProfile.walletAddress]);

  // Fireworks celebration after successful investment
  const launchFireworks = useCallback(() => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ["#10b981", "#34d399", "#6ee7b7", "#fbbf24", "#f59e0b"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ["#10b981", "#34d399", "#6ee7b7", "#fbbf24", "#f59e0b"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    // Big burst in the center
    confetti({
      particleCount: 100,
      spread: 100,
      origin: { x: 0.5, y: 0.4 },
      colors: ["#10b981", "#34d399", "#6ee7b7", "#fbbf24", "#f59e0b", "#ffffff"],
    });
  }, []);

  // Countdown timer for 24h after cap reached
  useEffect(() => {
    if (!capReached || !capDeadlineTime || investmentClosed) return;
    const timerId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timerId);
  }, [capReached, capDeadlineTime, investmentClosed]);

  // Connection Solana
  const getConnection = useCallback(() => {
    return new Connection(RPC_URL, "confirmed");
  }, []);

  // Charger les donnees des vaults (USDC + USDG)
  const loadVaultData = useCallback(async () => {
    setIsLoadingVault(true);
    try {
      const connection = getConnection();

      // Load USDC vault
      const usdcVaultData = await getVaultData(connection, idea.id, "USDC");
      if (usdcVaultData) {
        setUsdcVaultTotal(utils.baseUnitsToUsdc(usdcVaultData.totalDeposited));
      }

      // Load USDG vault
      const usdgVaultData = await getVaultData(connection, idea.id, "USDG");
      if (usdgVaultData) {
        setUsdgVaultTotal(utils.baseUnitsToUsdc(usdgVaultData.totalDeposited));
      }

      // Load selected token's vault PDA for display
      const [vaultPda] = await getVaultPda(idea.id, selectedToken);
      setVaultAddress(vaultPda.toBase58());

      const exists = await vaultExists(connection, idea.id, selectedToken);
      setVaultInitialized(exists);

      // Charger le depot de l'utilisateur pour le token selectionne
      if (userProfile.walletAddress) {
        const userDeposit = await getUserDepositData(
          connection,
          idea.id,
          new PublicKey(userProfile.walletAddress),
          selectedToken
        );
        if (userDeposit) {
          setUserOnChainDeposit(utils.baseUnitsToUsdc(userDeposit.amount));
        } else {
          setUserOnChainDeposit(0);
        }
      }
    } catch (error) {
      console.error("Failed to load vault data:", error);
    } finally {
      setIsLoadingVault(false);
    }
  }, [idea.id, userProfile.walletAddress, getConnection, selectedToken]);

  // Charger les investissements depuis l'API (pour l'historique)
  const loadInvestments = useCallback(async () => {
    try {
      const response = await fetch(`/api/idea-investments?ideaId=${idea.id}`);
      if (response.ok) {
        const data = await response.json();
        setInvestments(data.investments || []);
        setNetByWallet(data.net_by_wallet || {});
        // Compute historical totals from ALL non-refunded investments
        const allInvs = (data.investments || []) as InvestmentRecord[];
        const nonRefunded = allInvs.filter((inv: InvestmentRecord) => inv.status !== 'refunded');
        setTotalEverRaised(nonRefunded.reduce((sum: number, inv: InvestmentRecord) => sum + inv.amount_usdc, 0));
        setTotalInvestorCount(new Set(nonRefunded.map((inv: InvestmentRecord) => inv.investor_wallet)).size);
        if (userProfile.walletAddress) {
          const userInvs =
            data.investments?.filter(
              (inv: InvestmentRecord) =>
                inv.investor_wallet === userProfile.walletAddress
            ) || [];
          setUserInvestments(userInvs);
        } else {
          setUserInvestments([]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch investments:", error);
    }
  }, [idea.id, userProfile.walletAddress]);

  // Charger l'allocation pro-rata réelle pour le wallet connecté.
  // /api/idea-allocation calcule la distribution exacte (99% × 10M
  // tokens × invested / totalRaised) — c'est ce que l'utilisateur
  // recevra (ou a déjà reçu) en airdrop. Distinct du calcul
  // `invested / initialTokenPrice` qui est une estimation au prix
  // pool, fausse pour les raises sous-souscrits ou un seul investor.
  const loadUserAllocation = useCallback(async () => {
    if (!userProfile.walletAddress) {
      setUserAllocationTokens(null);
      return;
    }
    try {
      const res = await fetch(`/api/idea-allocation?ideaId=${idea.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        allocations?: Array<{ wallet: string; tokens: number }>;
      };
      const mine = (data.allocations || []).find(a => a.wallet === userProfile.walletAddress);
      setUserAllocationTokens(mine ? mine.tokens : 0);
    } catch (err) {
      console.error("Failed to fetch user allocation:", err);
    }
  }, [idea.id, userProfile.walletAddress]);

  // Charger le solde du token selectionne
  const loadTokenBalance = useCallback(async () => {
    if (!userProfile.walletAddress || !userProfile.walletConnected) {
      setTokenBalance(null);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const connection = getConnection();
      const result = await getTokenBalance(
        connection,
        new PublicKey(userProfile.walletAddress),
        NETWORK,
        selectedToken
      );
      setTokenBalance(result.balance);
      if (result.error) {
        console.warn("Balance fetch warning:", result.error);
      }
    } catch (error) {
      console.error(`Failed to fetch ${selectedToken} balance:`, error);
      setTokenBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [userProfile.walletAddress, userProfile.walletConnected, getConnection, selectedToken]);

  // Effects
  useEffect(() => {
    if (idea.id) {
      loadVaultData();
      loadInvestments();
      loadUserAllocation();
    }
  }, [idea.id, loadVaultData, loadInvestments, loadUserAllocation]);

  useEffect(() => {
    loadTokenBalance();
  }, [loadTokenBalance, showDepositModal]);

  // Load on-chain project token balance for funded ideas
  useEffect(() => {
    if (!idea.tokenAddress || !userProfile.walletAddress) return;
    if (idea.timelinePhase == null || idea.timelinePhase < 4) return;

    const load = async () => {
      try {
        const rpcUrl = RPC_URLS[NETWORK] || RPC_URLS.devnet;
        const connection = new Connection(rpcUrl, "confirmed");
        const walletPk = new PublicKey(userProfile.walletAddress!);
        const mintPk = new PublicKey(idea.tokenAddress!);
        const result = await getCustomTokenBalance(connection, walletPk, mintPk);
        setProjectTokenBalance(result.balance);
      } catch (err) {
        console.error("Error loading project token balance:", err);
        setProjectTokenBalance(null);
      }
    };
    load();
  }, [idea.tokenAddress, idea.timelinePhase, userProfile.walletAddress]);

  // Type for wallet provider (unified interface)
  interface WalletProviderInterface {
    signTransaction: (transaction: Transaction) => Promise<Transaction>;
    publicKey?: { toString(): string };
    isConnected?: boolean;
  }

  // Get connected wallet provider via shared context or window globals
  const getConnectedWalletProvider = (): WalletProviderInterface => {
    const targetAddress = userProfile.walletAddress;
    if (!targetAddress) {
      throw new Error("No wallet address found. Please connect your wallet.");
    }

    // Primary: use wallet context if fully connected
    if (walletState === 'CONNECTED' && ctxAddress && ctxWalletProvider && ctxWalletProvider !== "") {
      return {
        signTransaction: async (transaction: Transaction) => {
          const signed = await ctxSignTransaction(transaction, ctxWalletProvider as "PHANTOM" | "BACKPACK" | "SOLFLARE" | "JUPITER");
          if (!signed) throw new Error("Transaction signing failed");
          return signed;
        },
        publicKey: { toString: () => ctxAddress },
        isConnected: true,
      };
    }

    // Fallback: check window globals for connected wallet providers
    // @ts-expect-error - Phantom wallet global
    const phantom = window?.phantom?.solana;
    if (phantom?.isConnected && phantom?.publicKey?.toString() === targetAddress) {
      return phantom;
    }

    // @ts-expect-error - Backpack wallet global
    const backpack = window?.backpack;
    if (backpack?.isConnected && backpack?.publicKey?.toString() === targetAddress) {
      return backpack;
    }

    // @ts-expect-error - Solflare wallet global
    const solflare = window?.solflare;
    if (solflare?.isConnected && solflare?.publicKey?.toString() === targetAddress) {
      return solflare;
    }

    throw new Error(
      "No compatible wallet found. Please reconnect your wallet."
    );
  };

  // Initialiser le vault - returns true on success, false on failure
  const handleInitializeVault = async (): Promise<boolean> => {
    if (!userProfile.walletAddress) return false;

    setIsInitializing(true);
    try {
      const provider = getConnectedWalletProvider();
      const connection = getConnection();
      const payerPublicKey = new PublicKey(userProfile.walletAddress);

      // Creer la transaction
      const transaction = await createInitializeVaultTransaction(
        connection,
        payerPublicKey,
        idea.id,
        NETWORK,
        selectedToken
      );

      // Signer et envoyer avec preflight checks
      const signedTx = await provider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Wait for confirmation and check result
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log("Vault initialized:", signature);
      setTxSignature(signature);
      setVaultInitialized(true);

      // Recharger les donnees
      await loadVaultData();
      return true;
    } catch (error: unknown) {
      console.error("Failed to initialize vault:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize vault";
      toast.error(errorMessage);
      return false;
    } finally {
      setIsInitializing(false);
    }
  };

  // Deposer des tokens
  const handleDeposit = async () => {
    if (!userProfile.walletAddress || !depositAmount) return;

    // Validate amount using safe validation
    if (!utils.isValidUsdcAmount(depositAmount)) {
      toast.error(`Invalid amount. Please enter a valid ${selectedToken} amount.`);
      return;
    }

    const parsedAmount = parseFloat(depositAmount);

    if (parsedAmount < 0.001) {
      toast.error(`Minimum deposit is 0.001 ${selectedToken}`);
      return;
    }

    // Check user has sufficient balance
    if (tokenBalance !== null && parsedAmount > tokenBalance) {
      toast.error(`Insufficient balance. You have ${tokenBalance.toFixed(2)} ${selectedToken}`);
      return;
    }

    // Save email + TOU acceptance before the on-chain transaction
    if (!userTouAlreadyAccepted) {
      try {
        const putRes = await fetch("/api/user", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: userProfile.walletAddress,
            email: investorEmail,
            touAccepted: true,
          }),
        });
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({ message: "Failed to save email" }));
          toast.error((err as { message?: string }).message || "Failed to save email and Terms of Use");
          return;
        }
      } catch {
        toast.error("Failed to save email and Terms of Use. Please try again.");
        return;
      }
    }

    // Si le vault n'existe pas, l'initialiser d'abord
    if (!vaultInitialized) {
      const initSuccess = await handleInitializeVault();
      if (!initSuccess) return;
    }

    setIsDepositing(true);
    setTxSignature(null);

    try {
      const provider = getConnectedWalletProvider();
      const connection = getConnection();
      const userPublicKey = new PublicKey(userProfile.walletAddress);
      const amountInBaseUnits = utils.usdcToBaseUnits(depositAmount);

      // Creer la transaction de depot
      const transaction = await createDepositTransaction(
        connection,
        userPublicKey,
        idea.id,
        amountInBaseUnits,
        NETWORK,
        selectedToken
      );

      // Signer et envoyer avec preflight checks
      const signedTx = await provider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Wait for confirmation and check result
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log("Deposit successful:", signature);
      setTxSignature(signature);

      // Enregistrer l'investissement dans la base de donnees
      await fetch("/api/idea-investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaId: idea.id,
          investorWallet: userProfile.walletAddress,
          amountUsdc: parsedAmount,
          transactionSignature: signature,
          isOnChain: true,
          vaultAddress: vaultAddress,
          currency: selectedToken,
          investorTwitterUsername: userProfile.xUsername || undefined,
          investorEmail,
          touAccepted: true,
        }),
      });

      // Recharger les donnees
      await loadVaultData();
      await loadInvestments();
      await loadTokenBalance();

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
      if (!userTouAlreadyAccepted) {
        // First-time acceptance — mark as already accepted for subsequent investments
        setUserTouAlreadyAccepted(true);
      }

      // Celebration!
      setSuccessAmount(parsedAmount);
      setShowSuccessPopup(true);
      launchFireworks();
    } catch (error: unknown) {
      console.error("Deposit failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to deposit. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsDepositing(false);
    }
  };

  // Retirer des tokens
  const handleWithdraw = async () => {
    if (!userProfile.walletAddress || !withdrawAmount) return;

    // Validate amount using safe validation
    if (!utils.isValidUsdcAmount(withdrawAmount)) {
      toast.error(`Invalid amount. Please enter a valid ${selectedToken} amount.`);
      return;
    }

    const parsedAmount = parseFloat(withdrawAmount);

    if (parsedAmount > userOnChainDeposit) {
      toast.error(`You cannot withdraw more than your deposited amount (${userOnChainDeposit.toFixed(2)} ${selectedToken})`);
      return;
    }

    setIsWithdrawing(true);
    setTxSignature(null);

    try {
      const provider = getConnectedWalletProvider();
      const connection = getConnection();
      const userPublicKey = new PublicKey(userProfile.walletAddress);
      const amountInBaseUnits = utils.usdcToBaseUnits(withdrawAmount);

      // Creer la transaction de retrait
      const transaction = await createWithdrawTransaction(
        connection,
        userPublicKey,
        idea.id,
        amountInBaseUnits,
        NETWORK,
        selectedToken
      );

      // Signer et envoyer avec preflight checks
      const signedTx = await provider.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Wait for confirmation and check result
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log("Withdrawal successful:", signature);
      setTxSignature(signature);

      // Record withdrawal in DB (handles both partial and full)
      try {
        await fetch("/api/idea-investments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: 'withdraw',
            ideaId: idea.id,
            investorWallet: userProfile.walletAddress,
            amountUsdc: parsedAmount,
            transactionSignature: signature,
            currency: selectedToken,
          }),
        });
      } catch (err) {
        console.error("Failed to record withdrawal:", err);
      }

      // Recharger les donnees
      await loadVaultData();
      await loadInvestments();
      await loadTokenBalance();

      setShowWithdrawModal(false);
      setWithdrawAmount("");
    } catch (error: unknown) {
      console.error("Withdrawal failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to withdraw. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Ne pas afficher si pas de prix estime
  if (!idea.estimatedPrice || idea.estimatedPrice <= 0) {
    return null;
  }

  // Explorer URL basee sur le network
  const explorerUrl = "https://solscan.io";
  const explorerSuffix = NETWORK === "devnet" ? "?cluster=devnet" : "";

  return (
    <>
      <style>{`
      @keyframes bounce-in {
        0% { opacity: 0; transform: scale(0.3); }
        50% { opacity: 1; transform: scale(1.05); }
        70% { transform: scale(0.95); }
        100% { transform: scale(1); }
      }
    `}</style>
      <div className="rounded-none border-0 bg-transparent p-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-satoshi font-bold text-white">Investment Opened</h4>
              <p className="text-[10px] font-geist text-neutral-500">On-chain vault (USDC / USDG)</p>
            </div>
          </div>
          {/* Network badge - only show if not mainnet */}
          {NETWORK !== "mainnet" && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 font-satoshi">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-[9px] font-medium text-yellow-400 uppercase">
                {NETWORK}
              </span>
            </div>
          )}
        </div>


        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-satoshi text-neutral-400">Progress</span>
            <span className="text-xs font-satoshi font-bold text-emerald-400">
              {progress.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* 72h Countdown after cap reached */}
        {capReached && capDeadline && !investmentClosed && (
          <div className="mb-4 p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2">
              {/* <Timer className="w-4 h-4 text-yellow-400" /> */}
              <span className="text-xs font-satoshi font-medium text-yellow-400 text-center">
                Minimum funding goal reached! Still open for investment.
              </span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1 text-lg font-bold text-yellow-300 font-mono">
              {(() => {
                const timeLeft = Math.max(0, capDeadline.getTime() - now.getTime());
                const d = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                const h = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((timeLeft % (1000 * 60)) / 1000);
                const pad = (n: number) => n.toString().padStart(2, "0");
                return `${pad(d)}:${pad(h)}:${pad(m)}:${pad(s)}`;
              })()}
            </div>
            {/* <p className="text-[10px] text-center text-yellow-400/60 mt-1">DD:HH:MM:SS</p> */}
          </div>
        )}

        {/* Investment closed banner / Hackathon banner */}
        {investmentClosed && (
          idea.timelinePhase != null && idea.timelinePhase >= 4 && idea.superteamUrl ? (
            <div className="mb-4 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <a
                href={idea.superteamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-satoshi font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Participate in Hackathon
              </a>
            </div>
          ) : (
            <div className={`mb-4 p-3 rounded-2xl ${idea.timelinePhase != null && idea.timelinePhase >= 4 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              <div className="flex items-center justify-center gap-2">
                {idea.timelinePhase != null && idea.timelinePhase >= 4 ? (
                  <>
                    <Rocket className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-satoshi font-bold text-emerald-400">Token Launched!</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-satoshi font-medium text-red-400">Investment round is closed. Funds are locked.</span>
                  </>
                )}
              </div>
            </div>
          )
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 rounded-2xl bg-white/[0.03]">
            <p className="text-sm font-satoshi font-bold text-emerald-400">
              {netByWalletTotal !== null ? `$${raised.toLocaleString()}` : '...'}
            </p>
            <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Raised</p>
          </div>
          <div className="text-center p-2 rounded-2xl bg-white/[0.03]">
            <p className="text-sm font-satoshi font-bold text-white">${goal.toLocaleString()}</p>
            <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Goal</p>
          </div>
          <div className="text-center p-2 rounded-2xl bg-white/[0.03]">
            <p className="text-sm font-satoshi font-bold text-white">{hardcoded?.investors ?? (totalInvestorCount !== null ? totalInvestorCount : (netByWallet ? Object.keys(netByWallet).length : '...'))}</p>
            <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Investors</p>
          </div>
        </div>
        {/* Total Tokens Received — preference order:
              1. `userAllocationTokens` from /api/idea-allocation
                 (exact pro-rata airdrop, 99% × 10M × invested/total).
                 Source of truth, matches the actual airdrop on chain.
              2. Fallback to invested / initialTokenPrice if the
                 allocation API hasn't responded yet (loading state)
                 — known to be off (pool-price estimate ≠ pro-rata
                 allocation), but better than nothing during the
                 first ~200ms of page load.
        */}
        {userProfile.walletAddress && netByWallet && netByWallet[userProfile.walletAddress] > 0 && (
          <div className="text-center p-2 rounded-2xl bg-white/[0.03] mb-4">
            <p className="text-sm font-satoshi font-bold text-emerald-400">
              {(userAllocationTokens !== null
                ? Math.floor(userAllocationTokens)
                : (idea.initialTokenPrice && idea.initialTokenPrice > 0
                    ? Math.floor(netByWallet[userProfile.walletAddress] / idea.initialTokenPrice)
                    : 0)
              ).toLocaleString()}{' '}
              {idea.ticker || 'tokens'}
            </p>
            <p className="text-[9px] font-satoshi text-neutral-500 uppercase">Total Tokens Received</p>
          </div>
        )}

        {/* Token selector - hidden when funded */}
        {userProfile.walletConnected && !(idea.timelinePhase != null && idea.timelinePhase >= 4) && (
          <div className="mb-4 flex items-stretch gap-2">
            <button
              onClick={() => setSelectedToken("USDC")}
              type="button"
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border py-1.5 text-xs font-satoshi font-medium transition-colors ${selectedToken === "USDC"
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400"
                : "border-white/[0.06] bg-white/[0.04] text-neutral-500 hover:text-neutral-300"
                }`}
            >
              <img src="/usdc.png" alt="" aria-hidden className="h-4 w-4 shrink-0 rounded-full" />
              <span className="truncate">USDC</span>
            </button>
            <a
              href="https://justspark.notion.site/USDG-VS-USDC-32941bf35b77803d8026fed395ed5e4d?source=copy_link"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.04] text-xs text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300"
            >
              ?
            </a>
            <button
              onClick={() => setSelectedToken("USDG")}
              type="button"
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border py-1.5 text-xs font-satoshi font-medium transition-colors ${selectedToken === "USDG"
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400"
                : "border-white/[0.06] bg-white/[0.04] text-neutral-500 hover:text-neutral-300"
                }`}
            >
              <img src="/usdg.png" alt="" aria-hidden className="h-4 w-4 shrink-0 rounded-full" />
              <span className="truncate">USDG</span>
            </button>
          </div>
        )}

        {/* User On-Chain Deposit / Token Holdings */}
        {userProfile.walletConnected && idea.timelinePhase != null && idea.timelinePhase >= 4 && idea.tokenAddress && projectTokenBalance != null && projectTokenBalance > 0 ? (
          (() => {
            const valuation = jupiterPrice != null ? projectTokenBalance * jupiterPrice : null;
            return (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-[10px] font-satoshi text-emerald-400 uppercase mb-1">
                    Token Holdings
                  </p>
                  <p className="text-lg font-satoshi font-bold text-white">
                    {projectTokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-[10px] font-satoshi text-emerald-400 uppercase mb-1">
                    Valuation
                  </p>
                  <p className="text-lg font-satoshi font-bold text-white">
                    {valuation != null ? `$${valuation.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                  </p>
                </div>
              </div>
            );
          })()
        ) : userProfile.walletConnected && userOnChainDeposit > 0 && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-satoshi text-emerald-400 uppercase mb-1">
                  Your On-Chain Balance ({selectedToken})
                </p>
                <p className="text-lg font-satoshi font-bold text-white">
                  ${userOnChainDeposit.toLocaleString()} {selectedToken}
                </p>
              </div>
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={capReached}
                title={capReached ? "Withdraw disabled - funding cap reached" : undefined}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-satoshi font-medium transition-colors ${capReached
                  ? "bg-white/[0.06] border-white/[0.06] text-neutral-500 cursor-not-allowed"
                  : "bg-orange-500/20 border-orange-500/30 text-orange-400 hover:bg-orange-500/30"
                  }`}
              >
                {capReached ? <Lock className="w-3 h-3" /> : <ArrowDownToLine className="w-3 h-3" />}
                {capReached ? "Withdraw Locked" : "Withdraw"}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {idea.timelinePhase != null && idea.timelinePhase >= 4 ? (
          idea.tokenAddress ? (
            <a
              href={`https://jup.ag/tokens/${idea.tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-emerald-400 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Buy on Jupiter
            </a>
          ) : null
        ) : !userProfile.walletConnected ? (
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
            disabled={isLoadingVault || investmentClosed}
            className={`w-full flex items-center justify-center gap-2 py-3 font-satoshi font-bold text-sm rounded-xl disabled:opacity-50 ${investmentClosed
              ? "bg-neutral-600 text-neutral-300 cursor-not-allowed"
              : "bg-emerald-500 text-black hover:bg-emerald-400"
              }`}
          >
            {isLoadingVault ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : investmentClosed ? (
              <>
                <Lock className="w-4 h-4" />
                Investment Closed
              </>
            ) : (
              <>
                {userOnChainDeposit > 0 ? "Invest More" : "Invest Now"}
              </>
            )}
          </button>
        )}

        {/* Investors: Recent & Biggest */}
        {(() => {
          if (!netByWallet) return null;
          const allEntries = Object.entries(netByWallet);
          if (allEntries.length === 0) return null;

          // Recent: last 3 unique wallets by investment order (with their last tx)
          const seenWallets = new Set<string>();
          const recentWallets: { wallet: string; totalAmount: number; txSig?: string }[] = [];
          for (const inv of investments) {
            if (!seenWallets.has(inv.investor_wallet) && netByWallet[inv.investor_wallet] > 0) {
              seenWallets.add(inv.investor_wallet);
              recentWallets.push({ wallet: inv.investor_wallet, totalAmount: netByWallet[inv.investor_wallet], txSig: inv.transaction_signature });
              if (recentWallets.length >= 3) break;
            }
          }

          // Biggest: top 3 by net amount
          const biggestWallets = allEntries
            .map(([wallet, amount]) => ({ wallet, totalAmount: amount }))
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 3);

          return (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <div className="grid grid-cols-2 gap-3">
                {/* Recent */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="w-3 h-3 text-neutral-500" />
                    <span className="text-[10px] font-satoshi text-neutral-500 uppercase tracking-wider">Recent</span>
                  </div>
                  <div className="space-y-1">
                    {recentWallets.map((inv, i) => (
                      <a
                        key={i}
                        href={inv.txSig ? `https://orbmarkets.io/tx/${inv.txSig}${NETWORK === "devnet" ? "?cluster=devnet" : ""}` : `https://orbmarkets.io/account/${inv.wallet}${NETWORK === "devnet" ? "?cluster=devnet" : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full px-2 py-1 rounded-xl bg-white/[0.04] text-[10px] font-geist text-neutral-400 hover:text-emerald-400 hover:bg-white/[0.06] transition-colors cursor-pointer items-center justify-between"
                        title={inv.wallet}
                      >
                        <span>{inv.wallet.slice(0, 4)}...{inv.wallet.slice(-4)}</span>
                        <span className="text-neutral-600">•</span>
                        <span>${inv.totalAmount.toLocaleString()}</span>
                      </a>
                    ))}
                  </div>
                </div>
                {/* Biggest */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-3 h-3 text-neutral-500" />
                    <span className="text-[10px] font-satoshi text-neutral-500 uppercase tracking-wider">Biggest</span>
                  </div>
                  <div className="space-y-1">
                    {biggestWallets.map((inv, i) => (
                      <a
                        key={i}
                        href={`https://orbmarkets.io/account/${inv.wallet}${NETWORK === "devnet" ? "?cluster=devnet" : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full px-2 py-1 rounded-xl bg-white/[0.04] text-[10px] font-geist text-neutral-400 hover:text-emerald-400 hover:bg-white/[0.06] transition-colors cursor-pointer items-center justify-between"
                        title={inv.wallet}
                      >
                        <span>{inv.wallet.slice(0, 4)}...{inv.wallet.slice(-4)}</span>
                        <span className="text-neutral-600">•</span>
                        <span>${inv.totalAmount.toLocaleString()}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Deposit Modal */}
        {showDepositModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
              onClick={() => setShowDepositModal(false)}
            />
            <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-emerald-500/20 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-satoshi font-bold text-white">Invest {selectedToken}</h3>
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="text-neutral-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>


              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-satoshi font-medium text-neutral-400 uppercase mb-1.5 block">
                    Amount ({selectedToken})
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Enter amount..."
                      min="0.01"
                      max={tokenBalance !== null ? tokenBalance : undefined}
                      step="0.01"
                      className="w-full h-12 pl-9 pr-20 bg-white/[0.04] border border-white/[0.06] rounded-xl font-geist text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50"
                    />
                    {userProfile.walletConnected &&
                      tokenBalance !== null &&
                      tokenBalance > 0 && (
                        <button
                          onClick={() => {
                            setDepositAmount(tokenBalance.toFixed(2));
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/30 transition-colors"
                        >
                          Max
                        </button>
                      )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] font-geist text-neutral-500">
                      Remaining: ${remaining.toLocaleString()}
                    </p>
                    {tokenBalance !== null && (
                      <p className="text-[10px] font-geist text-neutral-500">
                        Balance: {tokenBalance.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })} {selectedToken}
                      </p>
                    )}
                  </div>
                </div>

                {/* Optional Comment */}
                {userProfile.xConnected && (
                  <div>
                    <label className="text-[10px] font-satoshi font-medium text-neutral-400 uppercase mb-1.5 block">
                      Comment (optional)
                    </label>
                    <textarea
                      value={investmentComment}
                      onChange={(e) => setInvestmentComment(e.target.value)}
                      placeholder="What's missing? Share features, use cases, or directions you'd love to see..."
                      rows={2}
                      className="w-full p-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl font-geist text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                    />
                  </div>
                )}

                {/* Email + Terms of Use (hidden if already accepted) */}
                {!userTouAlreadyAccepted && (
                  <>
                    <div>
                      <label className="text-[10px] font-satoshi font-medium text-neutral-400 uppercase mb-1.5 block">
                        Email address
                      </label>
                      <input
                        type="email"
                        value={investorEmail}
                        onChange={(e) => setInvestorEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        className={`w-full p-2.5 bg-white/[0.04] border rounded-xl font-geist text-white text-xs placeholder-neutral-500 focus:outline-none transition-colors ${investorEmail && !isValidEmail(investorEmail)
                          ? "border-red-500/50 focus:border-red-500/70"
                          : "border-white/[0.06] focus:border-emerald-500/50"
                          }`}
                      />
                      {investorEmail && !isValidEmail(investorEmail) && (
                        <p className="text-[10px] font-geist text-red-400 mt-1">Please enter a valid email address</p>
                      )}
                    </div>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={touAccepted}
                        onChange={(e) => setTouAccepted(e.target.checked)}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <span className="text-[10px] font-geist text-neutral-400">
                        I agree to the{" "}
                        <a
                          href="https://justspark.notion.site/SPARK-PROTOCOL-TERMS-OF-USE-32541bf35b7780c697c2f28fa430b615"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 underline"
                        >
                          Terms of Use
                        </a>
                      </span>
                    </label>
                  </>
                )}

                {/* Fee info */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                  <p className="text-[10px] font-geist text-neutral-400">
                    <Info className="w-3 h-3 inline mr-1" />
                    1% fees if raise is successful and token is launched
                  </p>
                </div>

                {txSignature && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] text-emerald-400 mb-1">
                      Transaction sent!
                    </p>
                    <a
                      href={`${explorerUrl}/tx/${txSignature}${explorerSuffix}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
                    >
                      View on Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDepositModal(false)}
                    className="flex-1 py-2.5 text-neutral-400 text-sm font-satoshi font-medium hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeposit}
                    disabled={
                      isDepositing ||
                      isInitializing ||
                      !depositAmount ||
                      parseFloat(depositAmount) <= 0 ||
                      investmentClosed ||
                      !investorEmail ||
                      !isValidEmail(investorEmail) ||
                      !touAccepted
                    }
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-emerald-400 disabled:opacity-50"
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

        {/* Success Celebration Popup */}
        {showSuccessPopup && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none">
            <div className="relative w-full max-w-sm mx-4 p-10 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-emerald-500/30 shadow-2xl shadow-black/50 pointer-events-auto animate-[bounce-in_0.5s_ease-out]">
              <button
                onClick={() => setShowSuccessPopup(false)}
                className="absolute top-3 right-3 text-neutral-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="text-center">
                <div className="text-5xl mb-3">🎉</div>
                <h3 className="text-lg font-satoshi font-bold text-white mb-1">Investment Successful!</h3>
                <p className="text-emerald-400 text-2xl font-satoshi font-bold mb-2">
                  ${successAmount.toLocaleString()} {selectedToken}
                </p>
                <p className="text-sm font-geist text-neutral-400">
                  You just backed <span className="text-white font-medium">{idea.title}</span>
                </p>
                <p className="text-xs font-geist text-neutral-500 mt-2">Thank you for believing in this idea!</p>
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={() => setShowSuccessPopup(false)}
                    className="flex-1 py-2.5 text-neutral-400 text-sm font-satoshi font-medium hover:text-white border border-white/[0.06] rounded-xl transition-colors"
                  >
                    Close
                  </button>
                  <a
                    href={`https://x.com/intent/tweet?text=${encodeURIComponent(`I just invested $${successAmount.toLocaleString()} ${selectedToken} in "${idea.title}" on @JustSparkIdeas! 🚀\n\nBack this idea too 👇\n${window.location.origin}/ideas/${idea.slug}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-black font-satoshi font-bold text-sm rounded-xl hover:bg-neutral-200 transition-colors"
                    onClick={() => setShowSuccessPopup(false)}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Share on X
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Withdraw Modal */}
        {showWithdrawModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
              onClick={() => setShowWithdrawModal(false)}
            />
            <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-orange-500/20 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-satoshi font-bold text-white">Withdraw {selectedToken}</h3>
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="text-neutral-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-satoshi font-medium text-neutral-400 uppercase mb-1.5 block">
                    Amount ({selectedToken})
                  </label>
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
                      className="w-full h-12 pl-9 pr-20 bg-white/[0.04] border border-white/[0.06] rounded-xl font-geist text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-orange-500/50"
                    />
                    {userOnChainDeposit > 0 && (
                      <button
                        onClick={() => setWithdrawAmount(userOnChainDeposit.toFixed(2))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 rounded border border-orange-500/30 transition-colors"
                      >
                        Max
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Available: ${userOnChainDeposit.toLocaleString()} {selectedToken}
                  </p>
                </div>

                {txSignature && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] text-emerald-400 mb-1">
                      Withdrawal successful!
                    </p>
                    <a
                      href={`${explorerUrl}/tx/${txSignature}${explorerSuffix}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
                    >
                      View on Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowWithdrawModal(false)}
                    className="flex-1 py-2.5 text-neutral-400 text-sm font-satoshi font-medium hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleWithdraw}
                    disabled={
                      isWithdrawing ||
                      !withdrawAmount ||
                      parseFloat(withdrawAmount) <= 0 ||
                      parseFloat(withdrawAmount) > userOnChainDeposit
                    }
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-satoshi font-bold text-sm rounded-xl hover:bg-orange-400 disabled:opacity-50"
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
    </>
  );
}

export default InvestmentSectionVault;
