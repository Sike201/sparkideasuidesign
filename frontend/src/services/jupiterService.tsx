import { Transaction } from "@solana/web3.js"
import { toast } from "react-toastify"
import { isMobile } from "@/utils/isMobile.ts"
import { getWallets } from "@wallet-standard/app"
import type { Wallet, WalletAccount } from "@wallet-standard/base"
import type { StandardConnectFeature } from "@wallet-standard/features"

const JUPITER_CHROME_URL = "https://chromewebstore.google.com/detail/jupiter-wallet/iledlaeogohbilgbfhmbgkgmpplbfboh"

let cachedAccount: WalletAccount | null = null

function findJupiterWallet(): Wallet | null {
  const { get } = getWallets()
  const all = get()
  return all.find(w => w.name.toLowerCase().includes("jupiter")) || null
}

export function getJupiterProvider() {
  return findJupiterWallet()
}

export async function connectJupiter(): Promise<string> {
  const wallet = findJupiterWallet()
  if (!wallet) {
    handleNoProvider()
    return ""
  }

  try {
    const connectFeature = wallet.features["standard:connect"] as StandardConnectFeature["standard:connect"] | undefined
    if (!connectFeature) {
      toast.error("Jupiter wallet does not support connect")
      return ""
    }
    const { accounts } = await connectFeature.connect()
    if (!accounts.length) {
      toast.error("No accounts returned from Jupiter wallet")
      return ""
    }
    cachedAccount = accounts[0]
    return accounts[0].address
  } catch (error) {
    console.error("Jupiter connection error:", error)
    throw error
  }
}

export async function signInJupiter(): Promise<string> {
  return connectJupiter()
}

export function setupJupiterWalletListeners(callbacks: {
  onConnect: (publicKey: any) => void
  onDisconnect: () => void
  onAccountChange: (address: string) => void
}): () => void {
  const wallet = findJupiterWallet()
  if (!wallet) return () => {}

  const eventsFeature = wallet.features["standard:events"] as
    | { on: (event: string, listener: (...args: any[]) => void) => () => void }
    | undefined

  if (!eventsFeature) return () => {}

  const off = eventsFeature.on("change", () => {
    if (wallet.accounts.length > 0) {
      cachedAccount = wallet.accounts[0]
      callbacks.onAccountChange(wallet.accounts[0].address)
    } else {
      cachedAccount = null
      callbacks.onDisconnect()
    }
  })

  // Check current state
  if (wallet.accounts.length > 0) {
    cachedAccount = wallet.accounts[0]
    callbacks.onAccountChange(wallet.accounts[0].address)
  }

  return off
}

export async function signTransactionWithJupiter(transaction: Transaction): Promise<Transaction | null> {
  const wallet = findJupiterWallet()
  if (!wallet || !cachedAccount) {
    console.error("Jupiter wallet or account not found!")
    return null
  }

  const signFeature = wallet.features["solana:signTransaction"] as
    | { signTransaction: (...inputs: any[]) => Promise<{ signedTransaction: Uint8Array }[]> }
    | undefined

  if (!signFeature) {
    console.error("Jupiter wallet does not support solana:signTransaction")
    return null
  }

  try {
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
    const [result] = await signFeature.signTransaction({
      account: cachedAccount,
      transaction: serialized,
      chain: "solana:mainnet",
    })
    return Transaction.from(result.signedTransaction)
  } catch (error) {
    console.error("Jupiter sign transaction error:", error)
    return null
  }
}

export async function signMessageWithJupiter(message: string): Promise<Uint8Array> {
  const wallet = findJupiterWallet()
  if (!wallet || !cachedAccount) {
    throw new Error("Jupiter wallet not found or not connected")
  }

  const signFeature = wallet.features["solana:signMessage"] as
    | { signMessage: (...inputs: any[]) => Promise<{ signature: Uint8Array }[]> }
    | undefined

  if (!signFeature) {
    throw new Error("Jupiter wallet does not support solana:signMessage")
  }

  const encoded = new TextEncoder().encode(message)
  const [result] = await signFeature.signMessage({
    account: cachedAccount,
    message: encoded,
  })
  return result.signature
}

function handleNoProvider(): void {
  if (isMobile()) {
    toast.error("Jupiter wallet is not available on mobile. Please use a desktop browser.")
  } else {
    toast.error("Jupiter wallet not detected! Please install the Jupiter extension.")
    window.open(JUPITER_CHROME_URL, "_blank")
  }
}
