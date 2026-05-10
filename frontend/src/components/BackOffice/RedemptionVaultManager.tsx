import { useCallback, useMemo, useState } from "react"
import { BN } from "@coral-xyz/anchor"
import { PublicKey, Transaction } from "@solana/web3.js"
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"
import { toast } from "react-toastify"
import { useQuery } from "@tanstack/react-query"

import { Button } from "@/components/Button/Button"
import { useWalletContext } from "@/hooks/useWalletContext"
import { backendSparkApi } from "@/data/api/backendSparkApi"
import {
  buildInitializeAndDeposit,
  buildReclaimRemainder,
  buildRedeem,
  prepareForSigning,
  sendAndConfirm,
  USDG_DEVNET,
  USDG_MAINNET,
  viewVault,
  viewVaultWithRetry,
  VaultState,
  REDEMPTION_PROGRAM_ID,
} from "@/services/redemptionVaultSdk"

type Cluster = "devnet" | "mainnet"

const FIELD =
  "rounded-md bg-default px-3 py-2 text-sm text-fg-primary border border-bd-primary focus:outline-none focus:border-brand-primary w-full"
const LABEL = "text-xs font-medium text-fg-secondary uppercase tracking-wide"

const explorerUrl = (sig: string, cluster: Cluster) =>
  `https://explorer.solana.com/tx/${sig}?cluster=${cluster === "mainnet" ? "mainnet-beta" : cluster}`

const RedemptionVaultManager = () => {
  const { address, walletProvider, signTransaction, isWalletConnected } = useWalletContext()

  // ── shared state ──
  const [cluster, setCluster] = useState<Cluster>("devnet")
  const [ideaId, setIdeaId] = useState("")
  const [vaultState, setVaultState] = useState<VaultState | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  // ── ideas list (for selector) ──
  const { data: ideasData, isLoading: ideasLoading } = useQuery({
    queryFn: () => backendSparkApi.getIdeas({ limit: 500 }),
    queryKey: ["redemption-vault-ideas"],
    refetchOnWindowFocus: false,
  })
  const ideas = useMemo(() => ideasData?.ideas ?? [], [ideasData])
  const selectedIdea = useMemo(
    () => ideas.find((i) => i.id === ideaId) ?? null,
    [ideas, ideaId]
  )

  // ── init form state ──
  const [tokenMint, setTokenMint] = useState("")
  const [eligibleTokens, setEligibleTokens] = useState("") // human amount of loser tokens eligible to redeem
  const [depositUsdg, setDepositUsdg] = useState("") // human amount of USDG to deposit
  const [tokenDecimals, setTokenDecimals] = useState("9")
  const USDG_DECIMALS = 6

  // Raw values computed from human inputs — BN-safe strings built via bigint math.
  const parseHumanToRaw = (human: string, decimals: number): bigint | null => {
    const s = human.trim()
    if (!s) return null
    if (!/^\d+(\.\d+)?$/.test(s)) return null
    const [intPart, fracPart = ""] = s.split(".")
    const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals)
    try {
      return BigInt(intPart || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0")
    } catch {
      return null
    }
  }

  const tokDec = Number(tokenDecimals) || 9
  const eligibleRaw = parseHumanToRaw(eligibleTokens, tokDec)
  const depositRaw = parseHumanToRaw(depositUsdg, USDG_DECIMALS)
  const ratePreview =
    eligibleRaw && depositRaw && eligibleRaw > 0n
      ? Number(depositRaw) / Number(eligibleRaw) // USDG raw per token raw
      : null
  const humanRatePreview =
    ratePreview !== null
      ? ratePreview * 10 ** tokDec / 10 ** USDG_DECIMALS // USDG (human) per 1 token (human)
      : null

  // ── redeem form state ──
  const [tokensInHuman, setTokensInHuman] = useState("") // human amount of loser tokens to burn
  const [tokenProgramChoice, setTokenProgramChoice] = useState<"token2022" | "token">("token")

  // Decimals + program of the loser token: prefer the live vault state, fall back to the init form.
  const redeemDecimals = vaultState?.tokenDecimals ?? (Number(tokenDecimals) || 9)
  const redeemTokenProgramFromVault = vaultState
    ? vaultState.tokenProgramId === TOKEN_2022_PROGRAM_ID.toBase58()
      ? "token2022"
      : "token"
    : null
  const effectiveTokenProgramChoice = redeemTokenProgramFromVault ?? tokenProgramChoice
  const tokensInRaw = parseHumanToRaw(tokensInHuman, redeemDecimals)

  // Estimated USDG received for the entered amount.
  const estUsdgRaw =
    tokensInRaw && vaultState
      ? (tokensInRaw * BigInt(vaultState.rateNum)) / BigInt(vaultState.rateDen)
      : null

  const usdgMint = cluster === "mainnet" ? USDG_MAINNET : USDG_DEVNET

  const getWalletSigner = useCallback((): (tx: Transaction) => Promise<Transaction> => {
    return async (tx) => {
      if (!walletProvider) throw new Error("No wallet connected")
      const prepared = await prepareForSigning(tx, new PublicKey(address), cluster)
      const signed = await signTransaction(prepared, walletProvider)
      if (!signed) throw new Error("User rejected signature")
      return signed
    }
  }, [address, walletProvider, signTransaction, cluster])

  const signerAdapter = useCallback(
    () => ({
      publicKey: new PublicKey(address),
      // Anchor's Program builder only reads publicKey when constructing a tx, not signing.
      signTransaction: async <T,>(tx: T) => tx,
      signAllTransactions: async <T,>(txs: T[]) => txs,
    }),
    [address]
  )

  const handleFetchVault = async () => {
    if (!ideaId.trim()) {
      toast.warning("Enter an idea id")
      return
    }
    setLoading("fetch")
    try {
      const state = await viewVault(ideaId.trim(), cluster)
      setVaultState(state)
      if (!state) toast.info("Vault not found — you can initialize it below.")
    } catch (e) {
      console.error(e)
      toast.error(`Fetch failed: ${(e as Error).message}`)
    } finally {
      setLoading(null)
    }
  }

  const handleInit = async () => {
    if (!isWalletConnected) return toast.error("Connect wallet first")
    if (!ideaId.trim()) return toast.error("Idea id required")
    if (!tokenMint.trim()) return toast.error("Token mint required")
    if (!eligibleRaw || eligibleRaw <= 0n) return toast.error("Eligible tokens must be > 0")
    if (!depositRaw || depositRaw <= 0n) return toast.error("USDG deposit must be > 0")

    setLoading("init")
    try {
      // Rate: usdg_out = tokens_in × rateNum / rateDen
      // Set rateNum = depositRaw, rateDen = eligibleRaw so full eligible burn drains the pot.
      const tx = await buildInitializeAndDeposit(
        signerAdapter() as any,
        {
          ideaId: ideaId.trim(),
          tokenMint: new PublicKey(tokenMint.trim()),
          usdgMint,
          rateNum: new BN(depositRaw.toString()),
          rateDen: new BN(eligibleRaw.toString()),
          depositAmount: new BN(depositRaw.toString()),
        },
        cluster
      )
      const signed = await getWalletSigner()(tx)
      const sig = await sendAndConfirm(signed, cluster)
      toast.success("Vault initialized")
      console.log("init tx:", explorerUrl(sig, cluster))
      // Devnet RPC propagation can lag a few seconds — retry the read.
      const fresh = await viewVaultWithRetry(ideaId.trim(), cluster)
      setVaultState(fresh)
      if (!fresh) toast.warning("Init confirmed but vault read still pending — try Fetch again.")
    } catch (e) {
      console.error(e)
      toast.error(`Init failed: ${(e as Error).message}`)
    } finally {
      setLoading(null)
    }
  }

  const handleRedeem = async () => {
    if (!isWalletConnected) return toast.error("Connect wallet first")
    if (!ideaId.trim()) return toast.error("Idea id required")
    if (!tokensInRaw || tokensInRaw <= 0n) return toast.error("Tokens to burn must be > 0")
    if (vaultState && estUsdgRaw !== null && estUsdgRaw <= 0n)
      return toast.error("Amount too small — payout would round to 0 USDG.")

    setLoading("redeem")
    try {
      const tokenProgram =
        effectiveTokenProgramChoice === "token2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
      const tx = await buildRedeem(
        signerAdapter() as any,
        {
          ideaId: ideaId.trim(),
          tokensIn: new BN(tokensInRaw.toString()),
          tokenProgram,
        },
        cluster
      )
      const signed = await getWalletSigner()(tx)
      const sig = await sendAndConfirm(signed, cluster)
      toast.success("Redeemed")
      console.log("redeem tx:", explorerUrl(sig, cluster))
      await handleFetchVault()
    } catch (e) {
      console.error(e)
      toast.error(`Redeem failed: ${(e as Error).message}`)
    } finally {
      setLoading(null)
    }
  }

  const handleReclaim = async () => {
    if (!isWalletConnected) return toast.error("Connect wallet first")
    if (!ideaId.trim()) return toast.error("Idea id required")

    setLoading("reclaim")
    try {
      const tx = await buildReclaimRemainder(signerAdapter() as any, ideaId.trim(), cluster)
      const signed = await getWalletSigner()(tx)
      const sig = await sendAndConfirm(signed, cluster)
      toast.success("Remainder reclaimed")
      console.log("reclaim tx:", explorerUrl(sig, cluster))
      await handleFetchVault()
    } catch (e) {
      console.error(e)
      toast.error(`Reclaim failed: ${(e as Error).message}`)
    } finally {
      setLoading(null)
    }
  }

  const formatHumanUsdg = (raw: string | number, decimals: number) => {
    const n = typeof raw === "string" ? Number(raw) : raw
    return (n / 10 ** decimals).toFixed(decimals)
  }

  const deadlineInfo = vaultState
    ? (() => {
        const nowSec = Math.floor(Date.now() / 1000)
        const diff = vaultState.deadline - nowSec
        if (diff > 0) return `expires in ${Math.floor(diff / 86400)}d ${Math.floor((diff % 86400) / 3600)}h`
        return `elapsed ${Math.floor(-diff / 86400)}d ${Math.floor((-diff % 86400) / 3600)}h`
      })()
    : ""

  return (
    <main className="z-[10] flex h-full w-full max-w-full flex-col items-center gap-6 py-[100px] font-normal text-fg-primary lg:py-[20px]">
      <div className="flex w-full max-w-4xl flex-col gap-1">
        <h1 className="text-center text-2xl font-semibold">Redemption Vault</h1>
        <p className="text-center text-sm text-fg-secondary">
          Program: <code>{REDEMPTION_PROGRAM_ID.toBase58()}</code> (devnet only)
        </p>
        {cluster === "mainnet" && (
          <p className="text-center text-xs text-status-error">
            ⚠ Program is not deployed on mainnet yet — switch back to devnet to test.
          </p>
        )}
      </div>

      {/* Cluster + Idea ID */}
      <div className="flex w-full max-w-4xl flex-col gap-3 rounded-xl border border-bd-primary bg-default/40 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Cluster</label>
            <select
              className={FIELD}
              value={cluster}
              onChange={(e) => setCluster(e.target.value as Cluster)}
            >
              <option value="devnet">devnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className={LABEL}>Idea</label>
            <select
              className={FIELD}
              value={ideaId}
              onChange={(e) => {
                const id = e.target.value
                setIdeaId(id)
                const picked = ideas.find((i) => i.id === id)
                if (picked?.token_address) setTokenMint(picked.token_address)
              }}
              disabled={ideasLoading}
            >
              <option value="">
                {ideasLoading ? "Loading ideas…" : `-- select an idea (${ideas.length}) --`}
              </option>
              {ideas.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title} — {i.status}
                  {i.token_address ? " · token ✓" : ""}
                </option>
              ))}
            </select>
            {selectedIdea && (
              <span className="text-[11px] text-fg-secondary break-all">
                id: <code>{selectedIdea.id}</code>
                {selectedIdea.token_address && (
                  <>
                    {" · token: "}
                    <code>{selectedIdea.token_address}</code>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            btnText={loading === "fetch" ? "Fetching…" : "Fetch Vault"}
            color="secondary"
            size="sm"
            onClick={handleFetchVault}
            disabled={loading !== null}
          />
        </div>
      </div>

      {/* Vault state */}
      {vaultState && (
        <div className="flex w-full max-w-4xl flex-col gap-2 rounded-xl border border-bd-primary bg-default/40 p-4">
          <h2 className="text-lg font-semibold">Current State</h2>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm md:grid-cols-2">
            <Row k="PDA" v={vaultState.pda} />
            <Row k="Authority" v={vaultState.authority} />
            <Row k="Token mint" v={vaultState.tokenMint} />
            <Row k="USDG mint" v={vaultState.usdgMint} />
            <Row k="Rate" v={`${vaultState.rateNum} / ${vaultState.rateDen}`} />
            <Row
              k="USDG deposited"
              v={`${formatHumanUsdg(vaultState.totalUsdgDeposited, vaultState.usdgDecimals)}`}
            />
            <Row
              k="USDG claimed"
              v={`${formatHumanUsdg(vaultState.totalUsdgClaimed, vaultState.usdgDecimals)}`}
            />
            <Row
              k="USDG remaining"
              v={`${formatHumanUsdg(vaultState.remainingUsdgRaw, vaultState.usdgDecimals)}`}
            />
            <Row k="Tokens burned (raw)" v={vaultState.totalTokensBurned} />
            <Row
              k="Deadline"
              v={`${new Date(vaultState.deadline * 1000).toISOString()}  (${deadlineInfo})`}
            />
            <Row k="Closed" v={String(vaultState.closed)} />
          </div>
        </div>
      )}

      {/* Initialize + deposit */}
      <div className="flex w-full max-w-4xl flex-col gap-3 rounded-xl border border-bd-primary bg-default/40 p-4">
        <h2 className="text-lg font-semibold">1 · Initialize & deposit</h2>
        <p className="text-xs text-fg-secondary">
          Signer becomes the vault authority. The USDG pot is pulled from the signer's USDG ATA.
          The redemption rate is derived automatically from (eligible tokens ↔ USDG deposited),
          so burning every eligible token drains exactly the pot.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className={LABEL}>Loser token mint</label>
            <input
              className={FIELD}
              placeholder="Token mint pubkey"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Eligible tokens</label>
            <input
              className={FIELD}
              placeholder="e.g. 1000000"
              value={eligibleTokens}
              onChange={(e) => setEligibleTokens(e.target.value)}
            />
            <span className="text-[11px] text-fg-secondary">
              Total supply held by users who can redeem (human amount).
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>USDG to deposit</label>
            <input
              className={FIELD}
              placeholder="e.g. 500"
              value={depositUsdg}
              onChange={(e) => setDepositUsdg(e.target.value)}
            />
            <span className="text-[11px] text-fg-secondary">
              Size of the USDG pot (human amount, 6 decimals on-chain).
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Token decimals</label>
            <input
              className={FIELD}
              placeholder="9"
              value={tokenDecimals}
              onChange={(e) => setTokenDecimals(e.target.value)}
            />
            <span className="text-[11px] text-fg-secondary">
              Ideacoins use 9 by default.
            </span>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className={LABEL}>Preview</label>
            {humanRatePreview !== null ? (
              <div className="rounded-md border border-bd-primary bg-default/40 p-3 text-xs">
                <div>
                  → 1 token ={" "}
                  <span className="font-mono">
                    {humanRatePreview.toLocaleString(undefined, { maximumFractionDigits: USDG_DECIMALS })}
                  </span>{" "}
                  USDG
                </div>
                <div className="text-fg-secondary">
                  raw rate: {depositRaw?.toString()} / {eligibleRaw?.toString()}
                </div>
                <div className="text-fg-secondary">
                  If every eligible token is redeemed, the pot empties exactly.
                </div>
              </div>
            ) : (
              <div className="text-xs text-fg-secondary">
                Fill both amounts to see the resulting rate.
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            btnText={loading === "init" ? "Sending…" : "Initialize + Deposit"}
            color="primary"
            size="sm"
            onClick={handleInit}
            disabled={loading !== null}
          />
        </div>
      </div>

      {/* Redeem */}
      <div className="flex w-full max-w-4xl flex-col gap-3 rounded-xl border border-bd-primary bg-default/40 p-4">
        <h2 className="text-lg font-semibold">2 · Redeem</h2>
        <p className="text-xs text-fg-secondary">
          Burns your loser tokens and sends USDG back at the fixed rate.
          {vaultState
            ? ` Decimals & token program auto-detected from the vault (${redeemDecimals} dec, ${effectiveTokenProgramChoice}).`
            : " Fetch the vault first to auto-detect decimals & token program."}
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Tokens to burn</label>
            <input
              className={FIELD}
              placeholder="e.g. 1.5"
              value={tokensInHuman}
              onChange={(e) => setTokensInHuman(e.target.value)}
            />
            <span className="text-[11px] text-fg-secondary">
              Human amount. Will be converted with {redeemDecimals} decimals →{" "}
              <span className="font-mono">{tokensInRaw?.toString() ?? "—"}</span> raw.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Token program</label>
            <select
              className={FIELD}
              value={effectiveTokenProgramChoice}
              onChange={(e) => setTokenProgramChoice(e.target.value as "token" | "token2022")}
              disabled={!!redeemTokenProgramFromVault}
            >
              <option value="token">SPL Token (classic)</option>
              <option value="token2022">Token-2022</option>
            </select>
            {redeemTokenProgramFromVault && (
              <span className="text-[11px] text-fg-secondary">
                Locked — auto-detected from the vault's token mint.
              </span>
            )}
          </div>
          {vaultState && estUsdgRaw !== null && (
            <div className="md:col-span-2 rounded-md border border-bd-primary bg-default/40 p-3 text-xs">
              <div>
                Estimated payout:{" "}
                <span className="font-mono">
                  {(Number(estUsdgRaw) / 10 ** vaultState.usdgDecimals).toFixed(
                    vaultState.usdgDecimals
                  )}
                </span>{" "}
                USDG
              </div>
              {estUsdgRaw <= 0n && (
                <div className="text-status-error">
                  ⚠ Payout rounds to 0. Increase the amount above the rate's threshold.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            btnText={loading === "redeem" ? "Sending…" : "Redeem"}
            color="primary"
            size="sm"
            onClick={handleRedeem}
            disabled={loading !== null}
          />
        </div>
      </div>

      {/* Reclaim remainder */}
      <div className="flex w-full max-w-4xl flex-col gap-3 rounded-xl border border-bd-primary bg-default/40 p-4">
        <h2 className="text-lg font-semibold">3 · Reclaim remainder</h2>
        <p className="text-xs text-fg-secondary">
          Only available to the vault authority AFTER its 30-day deadline.
        </p>
        <div className="flex justify-end">
          <Button
            btnText={loading === "reclaim" ? "Sending…" : "Reclaim Remainder"}
            color="danger"
            size="sm"
            onClick={handleReclaim}
            disabled={loading !== null}
          />
        </div>
      </div>
    </main>
  )
}

const Row = ({ k, v }: { k: string; v: string | number }) => (
  <div className="flex gap-2 break-all">
    <span className="min-w-[140px] text-fg-secondary">{k}:</span>
    <span className="font-mono text-xs">{String(v)}</span>
  </div>
)

export default RedemptionVaultManager
