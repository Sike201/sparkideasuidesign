import { createContext, ReactNode, useContext, useEffect, useState } from "react"
import { usePersistedState } from "@/hooks/usePersistedState.ts"
import { isMobile } from "@/utils/isMobile.ts"
import { useSearchParams } from "react-router-dom"
import { PublicKey, Transaction } from "@solana/web3.js"
import { toast } from "react-toastify"
import { 
  connectPhantom, 
  signInPhantom, 
  setupPhantomWalletListeners,
  signTransactionWithPhantom,
  signMessageWithPhantom
} from "@/services/phantomService"
import { 
  connectBackpack, 
  signInBackpack, 
  setupBackpackWalletListeners,
  signTransactionWithBackpack,
  signMessageWithBackpack
} from "@/services/backpackService"
import {
  connectSolflare,
  signInSolflare,
  setupSolflareWalletListeners,
  signTransactionWithSolflare,
  signMessageWithSolflare
} from "@/services/solflareService"
import {
  connectJupiter,
  signInJupiter,
  setupJupiterWalletListeners,
  signTransactionWithJupiter,
  signMessageWithJupiter
} from "@/services/jupiterService"

const AUTO_CONNECT_PARAM_KEY = "autoConnect"

export type WalletState = "NOT_CONNECTED" | "CONNECTING" | "CONNECTED"

const SupportedWallets = ["PHANTOM", "BACKPACK", "SOLFLARE", "JUPITER"] as const
export type SupportedWallet = (typeof SupportedWallets)[number]

type Context = {
  address: string
  walletState: WalletState
  walletProvider: SupportedWallet | ""
  signInWithPhantom: () => void
  signInWithBackpack: () => void
  signInWithSolflare: () => void
  signInWithJupiter: () => void
  connectWithPhantom: () => void
  connectWithBackpack: () => void
  connectWithSolflare: () => void
  connectWithJupiter: () => void
  signOut: () => void
  truncatedAddress: string
  signMessage: (message: string) => Promise<Uint8Array>
  signTransaction: (transaction: Transaction, walletType: SupportedWallet) => Promise<Transaction | null>
  isWalletConnected: boolean
  isConnectedWithLedger: boolean
  setIsConnectedWithLedger: (value: boolean) => void
}

const WalletContext = createContext<Context | undefined>(undefined)

export function useWalletContext() {
  const context = useContext(WalletContext)
  if (!context) throw new Error("Component is outside of the <WalletProvider />")
  return context
}

/**
 * Provider provided by the extension
 * e.g. window.phantom.solana or window.backpack or window.solflare
 * Typing not complete.
 */
export type Provider = {
  signIn: (args: { domain: string }) => Promise<{
    address: { toString(): string }
  }>
  connect: () => Promise<{
    publicKey: { toString(): string }
  }>
  signTransaction: (transacton: Transaction) => Promise<Transaction>
  publicKey: PublicKey
  isConnected: boolean
  on: (event: string, callback: (publicKey: PublicKey | { publicKey: string } | string) => void) => void
  removeListener: (event: string, callback: (publicKey: PublicKey | { publicKey: string } | string) => void) => void
  disconnect: () => Promise<void>
}

export type signTransactionArgs = {
  walletType: SupportedWallet
  tokenAmount: number
  rpcUrl: string
  tokenMintAddress: PublicKey
}

/**
 * Provides wallet connectivity functionality for the app.
 * @param children
 * @constructor
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  //// hooks
  const [address, setAddress] = usePersistedState("address")
  const [walletProvider, setWalletProvider] = usePersistedState<SupportedWallet | "">("wallet")
  const initialWalletState: WalletState = address ? "CONNECTED" : "NOT_CONNECTED"
  const [walletState, setWalletState] = useState<WalletState>(initialWalletState)
  const [isConnectedWithLedger, setIsConnectedWithLedger] = useState(false)

  const isWalletConnected = walletState === "CONNECTED" && Boolean(address)

  // autoConnect feature
  const [searchParams, setSearchParams] = useSearchParams()
  const autoConnect = searchParams.get(AUTO_CONNECT_PARAM_KEY)
  useEffect(() => {
    if (autoConnect === null) return

    if (autoConnect.toUpperCase() === "PHANTOM") {
      connectWithPhantom()
    } else if (autoConnect.toUpperCase() === "BACKPACK") {
      connectWithBackpack()
    } else if (autoConnect.toUpperCase() === "SOLFLARE") {
      connectWithSolflare()
    } else if (autoConnect.toUpperCase() === "JUPITER") {
      connectWithJupiter()
    }

    setSearchParams((searchParams) => {
      searchParams.delete(AUTO_CONNECT_PARAM_KEY)
      return searchParams
    })
    // don't wanna add signInWithPhantom and signInWithBackpack in deps array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, setSearchParams])

  // Check if user is connected with Ledger after page reload
  useEffect(() => {
    if (!address || !walletProvider) return

    const checkLedgerConnection = async () => {
      const storedLedgerPreference = localStorage.getItem("isUsingLedger")
      if (storedLedgerPreference === "true") {
        setIsConnectedWithLedger(true)
        return
      }
    }

    checkLedgerConnection()
  }, [address, walletProvider])

  // Set up wallet event listeners
  useEffect(() => {
    if (!walletProvider) return

    // Handle connect event
    const handleConnect = (publicKey: PublicKey | { publicKey: string } | string) => {
      if (publicKey) {
        // Handle different formats of publicKey based on wallet provider
        let address = ""
        if (walletProvider === "BACKPACK") {
          // Backpack returns an object with a publicKey property
          if (typeof publicKey === 'object' && publicKey !== null && 'publicKey' in publicKey) {
            address = (publicKey as { publicKey: string }).publicKey
          } else {
            address = typeof publicKey === 'string' ? publicKey : String(publicKey)
          }
        } else {
          // For Phantom and Solflare
          address = String(publicKey)
        }

        setAddress(address)
        setWalletState("CONNECTED")
        // toast.info("Wallet connected")
      }
    }

    // Handle disconnect event
    const handleDisconnect = () => {
      setAddress("")
      setWalletState("NOT_CONNECTED")
      setWalletProvider("")
      toast.info("Wallet disconnected")
    }

    // Handle account change event
    const handleAccountChange = (newAddress: string) => {
      if (newAddress !== address) {
        setAddress(newAddress)
        // Reset Ledger connection status when wallet changes
        setIsConnectedWithLedger(false)
        // Update localStorage
        localStorage.setItem("isUsingLedger", "false")
      }
    }

    // Set up event listeners based on the wallet provider
    let cleanup: () => void = () => {}

    if (walletProvider === "PHANTOM") {
      cleanup = setupPhantomWalletListeners({
        onConnect: handleConnect,
        onDisconnect: handleDisconnect,
        onAccountChange: handleAccountChange
      })
    } else if (walletProvider === "BACKPACK") {
      cleanup = setupBackpackWalletListeners({
        onConnect: handleConnect,
        onDisconnect: handleDisconnect,
        onAccountChange: handleAccountChange
      })
    } else if (walletProvider === "SOLFLARE") {
      cleanup = setupSolflareWalletListeners({
        onConnect: handleConnect,
        onDisconnect: handleDisconnect,
        onAccountChange: handleAccountChange
      })
    } else if (walletProvider === "JUPITER") {
      cleanup = setupJupiterWalletListeners({
        onConnect: handleConnect,
        onDisconnect: handleDisconnect,
        onAccountChange: handleAccountChange
      })
    }

    // Poll active wallet address on window focus to catch account switches
    const handleFocus = () => {
      if (walletState !== "CONNECTED" || !walletProvider) return
      let currentKey: string | undefined
      if (walletProvider === "PHANTOM") {
        // @ts-expect-error - window global
        currentKey = window?.phantom?.solana?.publicKey?.toString()
      } else if (walletProvider === "BACKPACK") {
        // @ts-expect-error - window global
        currentKey = window?.backpack?.publicKey?.toString()
      } else if (walletProvider === "SOLFLARE") {
        // @ts-expect-error - window global
        currentKey = window?.solflare?.publicKey?.toString()
      }
      if (currentKey && currentKey !== address) {
        handleAccountChange(currentKey)
      }
    }
    const handleVisibility = () => { if (document.visibilityState === "visible") handleFocus() }
    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibility)

    // Clean up event listeners when component unmounts or wallet changes
    return () => {
      cleanup()
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [walletProvider, setAddress, setWalletProvider, setWalletState, address])

  //// not hooks
  async function connectWithPhantom() {
    try {
      setWalletState("CONNECTING")
      const address = await connectPhantom()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("PHANTOM")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  async function connectWithBackpack() {
    try {
      setWalletState("CONNECTING")
      const address = await connectBackpack()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("BACKPACK")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  async function connectWithSolflare() {
    try {
      setWalletState("CONNECTING")
      const address = await connectSolflare()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("SOLFLARE")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  async function connectWithJupiter() {
    try {
      setWalletState("CONNECTING")
      const address = await connectJupiter()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("JUPITER")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  async function signInWithPhantom() {
    try {
      setWalletState("CONNECTING")
      const address = await signInPhantom()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("PHANTOM")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  async function signInWithBackpack() {
    try {
      setWalletState("CONNECTING")
      const address = await signInBackpack()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("BACKPACK")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  async function signInWithSolflare() {
    try {
      setWalletState("CONNECTING")
      const address = await signInSolflare()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("SOLFLARE")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  async function signInWithJupiter() {
    try {
      setWalletState("CONNECTING")
      const address = await signInJupiter()
      setAddress(address)
      setWalletState("CONNECTED")
      setWalletProvider("JUPITER")
    } catch (e) {
      setWalletState("NOT_CONNECTED")
      handleConnectionError(e)
    }
  }

  function handleConnectionError(e: unknown) {
    if (e instanceof Error && e.message === "User rejected the request.") {
      // connection declined
      toast.warning("Sign in declined by user!")
    } else {
      // rethrow
      throw e
    }
  }

  async function signTransaction(transaction: Transaction, walletType: SupportedWallet): Promise<Transaction | null> {
    try {
      if (walletType === "BACKPACK") {
        // @ts-expect-error no typing
        const provider = window?.backpack
        if (!provider.isConnected) {
          toast("Wallet session timed out, please sign in again")
          await signInWithBackpack()
        }
        return await signTransactionWithBackpack(transaction)
      } else if (walletType === "PHANTOM") {
        // @ts-expect-error no typing
        const provider = window?.phantom.solana
        if (!provider.isConnected) {
          toast("Wallet session timed out, please sign in again")
          await signInWithPhantom()
        }
        return await signTransactionWithPhantom(transaction)
      } else if (walletType === "SOLFLARE") {
        // @ts-expect-error no typing
        const provider = window?.solflare
        if (!provider.isConnected) {
          toast("Wallet session timed out, please sign in again")
          await signInWithSolflare()
        }
        return await signTransactionWithSolflare(transaction)
      } else if (walletType === "JUPITER") {
        return await signTransactionWithJupiter(transaction)
      }
      throw new Error("Provider not found!")
    } catch (error) {
      console.error(error)
      return null
    }
  }

  async function signOut() {
    setAddress("")
    setWalletState("NOT_CONNECTED")
    setWalletProvider("")
    setIsConnectedWithLedger(false)
    // Update localStorage
    localStorage.setItem("isUsingLedger", "false")
    // disconnecting needs to be done manually for Solflare wallet
    // @ts-expect-error no typings
    if (window.solflare?.disconnect) {
      // @ts-expect-error no typings
      await window.solflare.disconnect()
    }
  }

  async function signMessage(message: string) {
    if (walletProvider === "PHANTOM") {
      return await signMessageWithPhantom(message)
    } else if (walletProvider === "BACKPACK") {
      return await signMessageWithBackpack(message)
    } else if (walletProvider === "SOLFLARE") {
      return await signMessageWithSolflare(message)
    } else if (walletProvider === "JUPITER") {
      return await signMessageWithJupiter(message)
    } else {
      throw new Error(`Unknown wallet provider: ${walletProvider} !`)
    }
  }

  const truncatedAddress = truncateAddress(address)

  return (
    <WalletContext.Provider
      value={{
        address,
        walletState,
        walletProvider,
        signInWithPhantom,
        signInWithBackpack,
        signInWithSolflare,
        signInWithJupiter,
        connectWithPhantom,
        connectWithBackpack,
        connectWithSolflare,
        connectWithJupiter,
        signOut,
        truncatedAddress,
        signMessage,
        signTransaction,
        isWalletConnected,
        isConnectedWithLedger,
        setIsConnectedWithLedger,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

function truncateAddress(address: string) {
  return address.slice(0, 4) + "..." + address.slice(-4)
}
