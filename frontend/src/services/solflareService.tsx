import { PublicKey, Transaction } from "@solana/web3.js"
import { toast } from "react-toastify"
import { isMobile, isBrave } from "@/utils/isMobile.ts"

const PAGE_URL = window.location.origin
const PAGE_DOMAIN = window.location.host

/**
 * Provider provided by the Solflare extension
 * Typing not complete.
 */
export type SolflareProvider = {
  signIn: (args: { domain: string }) => Promise<{
    account: { address: string }
  }>
  connect: () => Promise<{
    publicKey: { toString(): string }
  }>
  signTransaction: (transaction: Transaction) => Promise<Transaction>
  publicKey: PublicKey
  isConnected: boolean
  on: (event: string, callback: (publicKey: PublicKey | { publicKey: string } | string) => void) => void
  removeListener: (event: string, callback: (publicKey: PublicKey | { publicKey: string } | string) => void) => void
  disconnect: () => Promise<void>
}

/**
 * Get the Solflare provider from the window object
 */
export function getSolflareProvider(): SolflareProvider | null {
  // @ts-expect-error no typings
  return window?.solflare || null
}

/**
 * Connect to Solflare wallet
 * @returns The wallet address if successful
 */
export async function connectSolflare(): Promise<string> {
  // On mobile Brave browser, force open Solflare app instead of using Brave Wallet
  if (isMobile() && isBrave()) {
    handleNoProvider("SOLFLARE")
    return ""
  }

  const provider = getSolflareProvider()

  if (!provider) {
    handleNoProvider("SOLFLARE")
    return ""
  }

  try {
    await provider.connect()

    if (!provider.publicKey) {
      throw new Error("Failed to get public key from Solflare")
    }

    const address = provider.publicKey.toString()
    return address
  } catch (error) {
    console.error("Solflare connection error:", error)
    throw error
  }
}

/**
 * Sign in with Solflare wallet
 * @returns The wallet address if successful
 */
export async function signInSolflare(): Promise<string> {
  // On mobile Brave browser, force open Solflare app instead of using Brave Wallet
  if (isMobile() && isBrave()) {
    handleNoProvider("SOLFLARE")
    return ""
  }

  const provider = getSolflareProvider()

  if (!provider) {
    handleNoProvider("SOLFLARE")
    return ""
  }

  try {
    const signInRes = await provider.signIn({
      domain: PAGE_DOMAIN,
    })
    const address = signInRes.account.address
    return address
  } catch (error) {
    console.error("Solflare sign in error:", error)
    throw error
  }
}

/**
 * Set up Solflare wallet event listeners
 * @param callbacks Object containing callback functions for different events
 * @returns Cleanup function to remove event listeners
 */
export function setupSolflareWalletListeners(callbacks: {
  onConnect: (publicKey: PublicKey | { publicKey: string } | string) => void
  onDisconnect: () => void
  onAccountChange: (address: string) => void
}): () => void {
  const provider = getSolflareProvider()
  
  if (!provider) {
    console.error("Solflare provider not found!")
    return () => {}
  }
  
  // Add event listeners to the Solflare provider
  provider.on("connect", callbacks.onConnect)
  provider.on("disconnect", callbacks.onDisconnect)
  
  // Handle account change event for Solflare
  const handleSolflareAccountChanged = (publicKey: PublicKey | { publicKey: string } | string) => {
    if (publicKey) {
      // Handle Solflare's specific format
      let address = ""
      if (typeof publicKey === 'object' && publicKey !== null && 'publicKey' in publicKey) {
        address = (publicKey as { publicKey: string }).publicKey
      } else {
        address = typeof publicKey === 'string' ? publicKey : String(publicKey)
      }
      
      callbacks.onAccountChange(address)
    } else {
      // Attempt to reconnect
      provider.connect().catch((error: Error) => {
        console.error("Failed to reconnect to Solflare:", error)
      })
    }
  }
  
  provider.on("accountChanged", handleSolflareAccountChanged)
  
  // Return cleanup function
  return () => {
    provider.removeListener("connect", callbacks.onConnect)
    provider.removeListener("disconnect", callbacks.onDisconnect)
    provider.removeListener("accountChanged", handleSolflareAccountChanged)
  }
}

/**
 * Sign a transaction with Solflare wallet
 * @param transaction The transaction to sign
 * @returns The signed transaction or null if signing failed
 */
export async function signTransactionWithSolflare(transaction: Transaction): Promise<Transaction | null> {
  const provider = getSolflareProvider()
  
  if (!provider) {
    console.error("Solflare provider not found!")
    return null
  }
  
  try {
    const signedTx = await provider.signTransaction(transaction)
    return signedTx
  } catch (error) {
    console.error("Solflare sign transaction error:", error)
    return null
  }
}

/**
 * Sign a message with Solflare wallet
 * @param message The message to sign
 * @returns The signature as Uint8Array
 */
export async function signMessageWithSolflare(message: string): Promise<Uint8Array> {
  // @ts-expect-error no typing
  const signature = await window.solflare.signMessage(Buffer.from(message))
  return signature.signature
}

/**
 * Handle case when wallet provider is not detected
 * Redirects to Solflare app on mobile or shows alert on desktop
 */
function handleNoProvider(walletName: string): void {
  if (isMobile()) {
    // Solflare mobile deep link format (uses solflare.com, not .app)
    const url = `${PAGE_URL}/?autoConnect=${walletName}`
    const encodedUrl = encodeURIComponent(url)
    // Solflare uses a different deep link format
    const deepLink = `https://solflare.com/ul/v1/browse/${encodedUrl}?cluster=mainnet-beta`
    window.location.href = deepLink
  } else {
    const message = `Solflare wallet not detected! Please install the Solflare extension.`
    toast.error(message)
  }
}
