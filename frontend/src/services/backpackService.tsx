import { PublicKey, Transaction } from "@solana/web3.js"
import { toast } from "react-toastify"
import { isMobile, isBrave } from "@/utils/isMobile.ts"

const PAGE_URL = window.location.origin
const PAGE_DOMAIN = window.location.host

/**
 * Provider provided by the Backpack extension
 * Typing not complete.
 */
export type BackpackProvider = {
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
 * Get the Backpack provider from the window object
 */
export function getBackpackProvider(): BackpackProvider | null {
  // @ts-expect-error no typings
  return window?.backpack || null
}

/**
 * Connect to Backpack wallet
 * @returns The wallet address if successful
 */
export async function connectBackpack(): Promise<string> {
  // On mobile Brave browser, force open Backpack app instead of using Brave Wallet
  if (isMobile() && isBrave()) {
    handleNoProvider("BACKPACK")
    return ""
  }

  const provider = getBackpackProvider()

  if (!provider) {
    handleNoProvider("BACKPACK")
    return ""
  }

  try {
    const signInRes = await provider.connect()
    const address = signInRes.publicKey.toString()
    return address
  } catch (error) {
    console.error("Backpack connection error:", error)
    throw error
  }
}

/**
 * Sign in with Backpack wallet
 * @returns The wallet address if successful
 */
export async function signInBackpack(): Promise<string> {
  // On mobile Brave browser, force open Backpack app instead of using Brave Wallet
  if (isMobile() && isBrave()) {
    handleNoProvider("BACKPACK")
    return ""
  }

  const provider = getBackpackProvider()

  if (!provider) {
    handleNoProvider("BACKPACK")
    return ""
  }

  try {
    const signInRes = await provider.signIn({
      domain: PAGE_DOMAIN,
    })
    const address = signInRes.account.address
    return address
  } catch (error) {
    console.error("Backpack sign in error:", error)
    throw error
  }
}

/**
 * Set up Backpack wallet event listeners
 * @param callbacks Object containing callback functions for different events
 * @returns Cleanup function to remove event listeners
 */
export function setupBackpackWalletListeners(callbacks: {
  onConnect: (publicKey: PublicKey | { publicKey: string } | string) => void
  onDisconnect: () => void
  onAccountChange: (address: string) => void
}): () => void {
  const provider = getBackpackProvider()
  
  if (!provider) {
    console.error("Backpack provider not found!")
    return () => {}
  }
  
  // Add event listeners to the Backpack provider
  provider.on("connect", callbacks.onConnect)
  provider.on("disconnect", callbacks.onDisconnect)
  
  // Handle account change event for Backpack
  const handleBackpackAccountChanged = (publicKey: PublicKey | { publicKey: string } | string) => {
    if (publicKey) {
      // Handle Backpack's specific format
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
        console.error("Failed to reconnect to Backpack:", error)
      })
    }
  }
  
  provider.on("accountChanged", handleBackpackAccountChanged)
  
  // Return cleanup function
  return () => {
    provider.removeListener("connect", callbacks.onConnect)
    provider.removeListener("disconnect", callbacks.onDisconnect)
    provider.removeListener("accountChanged", handleBackpackAccountChanged)
  }
}

/**
 * Sign a transaction with Backpack wallet
 * @param transaction The transaction to sign
 * @returns The signed transaction or null if signing failed
 */
export async function signTransactionWithBackpack(transaction: Transaction): Promise<Transaction | null> {
  const provider = getBackpackProvider()
  
  if (!provider) {
    console.error("Backpack provider not found!")
    return null
  }
  
  try {
    const signedTx = await provider.signTransaction(transaction)
    return signedTx
  } catch (error) {
    console.error("Backpack sign transaction error:", error)
    return null
  }
}

/**
 * Sign a message with Backpack wallet
 * @param message The message to sign
 * @returns The signature as Uint8Array
 */
export async function signMessageWithBackpack(message: string): Promise<Uint8Array> {
  // @ts-expect-error no typing
  const signature = await window.backpack.signMessage(Buffer.from(message))
  return signature.signature
}

/**
 * Handle case when wallet provider is not detected
 * Redirects to Backpack app on mobile or shows alert on desktop
 */
function handleNoProvider(walletName: string): void {
  if (isMobile()) {
    // Backpack mobile deep link format
    const url = `${PAGE_URL}/?autoConnect=${walletName}`
    const encodedUrl = encodeURIComponent(url)
    const encodedPageUrl = encodeURIComponent(PAGE_URL)
    // Use lowercase domain name for Backpack
    const deepLink = `https://backpack.app/ul/browse/${encodedUrl}?ref=${encodedPageUrl}`
    window.location.href = deepLink
  } else {
    const message = `Backpack wallet not detected! Please install the Backpack extension.`
    toast.error(message)
  }
}
