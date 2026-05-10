/**
 * Context Boilerplate
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react"
import { useWalletContext } from "./useWalletContext"
import { useMutation } from "@tanstack/react-query"
import { backendSparkApi } from "@/data/api/backendSparkApi"
import { AdminAuthFields } from "shared/models"
import { toast } from "react-toastify"
import { useNavigate } from "react-router-dom"

type Context = {
  isSignedIn: boolean
  isPending: boolean
  auth: AdminAuthFields | null
}

const AuthContext = createContext<Context | undefined>(undefined)

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("Component is outside of the <AuthProvider />")
  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [auth, setAuth] = useState<AdminAuthFields | null>(null)
  const { signMessage, address, isWalletConnected } = useWalletContext()
  const navigate = useNavigate()

  // fetch Analyst and token via sessionId
  const { mutate: checkIfUserIsAdmin, isPending } = useMutation({
    mutationFn: async (auth: AdminAuthFields) => backendSparkApi.isAdmin(auth),
    onError: (error) => {
      toast.error(error.message)
      navigate("/", { replace: true })
    },
    onSuccess: (_data, variables) => {
      setIsSignedIn(true)
      setAuth(variables)
    },
    gcTime: 0,
  })

  const checkIfUserIsAdminHandler = useCallback(async () => {
    try {
      console.log("🚀 ~ checkIfUserIsAdminHandler")

      // Ensure Phantom is actually connected before signing
      // (persisted state may be stale after wallet switch or session expiry)
      const provider = (window as any)?.phantom?.solana
      if (provider && !provider.isConnected) {
        try {
          await provider.connect({ onlyIfTrusted: true })
        } catch {
          // Trusted connect failed — need explicit connect
          await provider.connect()
        }
      }

      const message = "I confirm that I'm admin"
      const signature = Array.from(await signMessage(message))
      const auth = { address, message, signature }

      checkIfUserIsAdmin(auth)
    } catch (e) {
      console.warn("Admin auth check failed:", e)
    }
  }, [address, checkIfUserIsAdmin, signMessage])

  useEffect(() => {
    if (!isSignedIn && isWalletConnected && address) {
      checkIfUserIsAdminHandler()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWalletConnected, address])

  // check if user signed out
  useEffect(() => {
    if (!isWalletConnected || !address) {
      setIsSignedIn(false)
      setAuth(null)
      return
    }
  }, [isWalletConnected, address, isSignedIn, checkIfUserIsAdminHandler])

  return <AuthContext.Provider value={{ isSignedIn, isPending, auth }}>{children}</AuthContext.Provider>
}
