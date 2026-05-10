import { PublicKey, Transaction } from "@solana/web3.js"
import { toast } from "react-toastify"
import { isMobile, isBrave } from "@/utils/isMobile.ts"

const PAGE_URL = window.location.origin
const PAGE_DOMAIN = window.location.host

/**
 * Provider provided by the Phantom extension
 * Typing not complete.
 */
export type PhantomProvider = {
  signIn: (args: { domain: string }) => Promise<{
    address: { toString(): string }
  }>
  connect: (args?: { onlyIfTrusted?: boolean }) => Promise<{
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
 * Get the Phantom provider from the window object
 */
export function getPhantomProvider(): PhantomProvider | null {
  // @ts-expect-error no typings
  return window?.phantom?.solana || null
}

/**
 * Connect to Phantom wallet
 * @returns The wallet address if successful
 */
export async function connectPhantom(): Promise<string> {
  // On mobile Brave browser, force open Phantom app instead of using Brave Wallet
  if (isMobile() && isBrave()) {
    handleNoProvider("PHANTOM")
    return ""
  }

  const provider = getPhantomProvider()

  if (!provider) {
    handleNoProvider("PHANTOM")
    return ""
  }

  try {
    const signInRes = await provider.connect()
    const address = signInRes.publicKey.toString()
    return address
  } catch (error) {
    console.error("Phantom connection error:", error)
    throw error
  }
}

/**
 * Sign in with Phantom wallet
 * @returns The wallet address if successful
 */
export async function signInPhantom(): Promise<string> {
  // On mobile Brave browser, force open Phantom app instead of using Brave Wallet
  if (isMobile() && isBrave()) {
    handleNoProvider("PHANTOM")
    return ""
  }

  const provider = getPhantomProvider()

  if (!provider) {
    handleNoProvider("PHANTOM")
    return ""
  }

  try {
    const signInRes = await provider.signIn({
      domain: PAGE_DOMAIN,
    })
    const address = signInRes.address.toString()
    return address
  } catch (error) {
    console.error("Phantom sign in error:", error)
    throw error
  }
}

/**
 * Set up Phantom wallet event listeners
 * @param callbacks Object containing callback functions for different events
 * @returns Cleanup function to remove event listeners
 */
export function setupPhantomWalletListeners(callbacks: {
  onConnect: (publicKey: PublicKey | { publicKey: string } | string) => void
  onDisconnect: () => void
  onAccountChange: (address: string) => void
}): () => void {
  const provider = getPhantomProvider()
  
  if (!provider) {
    console.error("Phantom provider not found!")
    return () => {}
  }
  
  // Add event listeners directly to the Phantom provider
  provider.on("connect", callbacks.onConnect)
  provider.on("disconnect", callbacks.onDisconnect)
  
  const handleFocusChange = () => {
    if (provider.publicKey) {
      const currentAddress = provider.publicKey.toString()
      callbacks.onAccountChange(currentAddress)
    }
    // Also check current account when window gets focus
    checkCurrentAccount()
  }
  
  // Add event listeners
  window.addEventListener('focus', handleFocusChange)
  
  // Create a function to check the current account
  const checkCurrentAccount = async () => {
    try {
      // Try to get the current account directly
      const currentAccount = await provider.connect({ onlyIfTrusted: true })
      
      if (currentAccount && currentAccount.publicKey) {
        const newAddress = currentAccount.publicKey.toString()
        callbacks.onAccountChange(newAddress)
      }
    } catch (error) {
      console.error("Direct account check error (expected if not trusted):", error)
    }
  }
  
  // Check the account immediately
  checkCurrentAccount()
  
  // Return cleanup function
  return () => {
    provider.removeListener("connect", callbacks.onConnect)
    provider.removeListener("disconnect", callbacks.onDisconnect)
    window.removeEventListener('focus', handleFocusChange)
  }
}

/**
 * Sign a transaction with Phantom wallet
 * @param transaction The transaction to sign
 * @returns The signed transaction or null if signing failed
 */
export async function signTransactionWithPhantom(transaction: Transaction): Promise<Transaction | null> {
  const provider = getPhantomProvider()
  
  if (!provider) {
    console.error("Phantom provider not found!")
    return null
  }
  
  try {
    const signedTx = await provider.signTransaction(transaction)
    return signedTx
  } catch (error) {
    console.error("Phantom sign transaction error:", error)
    return null
  }
}

/**
 * Sign a message with Phantom wallet
 * @param message The message to sign
 * @returns The signature as Uint8Array
 */
export async function signMessageWithPhantom(message: string): Promise<Uint8Array> {
  const provider = getPhantomProvider();
  if (!provider) {
    throw new Error('Phantom wallet not found');
  }
  // Use type assertion since signMessage is not in PhantomProvider type
  const walletWithSignMessage = provider as PhantomProvider & {
    signMessage: (message: Buffer) => Promise<{ signature: Uint8Array }>;
  };
  const signature = await walletWithSignMessage.signMessage(Buffer.from(message));
  return signature.signature;
}

/**
 * Handle case when wallet provider is not detected
 * Redirects to Phantom app on mobile or shows alert on desktop
 */
function handleNoProvider(walletName: string): void {
  if (isMobile()) {
    // Phantom mobile deep link format
    const url = `${PAGE_URL}/?autoConnect=${walletName}`
    const encodedUrl = encodeURIComponent(url)
    const encodedPageUrl = encodeURIComponent(PAGE_URL)
    // Use lowercase domain name for Phantom
    const deepLink = `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedPageUrl}`
    window.location.href = deepLink
  } else {
    const message = `Phantom wallet not detected! Please install the Phantom extension.`
    toast.error(message)
  }
}