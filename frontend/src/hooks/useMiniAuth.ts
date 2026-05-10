/**
 * Mini-app session hook.
 *
 * Holds:
 *   - the 7-day JWT issued after Twitter OAuth (mode=mini)
 *   - the cached Twitter user profile
 *   - the session-wide active wallet type (public | private)
 *
 * Everything lives in localStorage so it survives page reloads + PWA
 * background state. The wallet-type switch is intentionally client-only
 * (per product decision — no round-trip, no server sync in v1).
 */

import { useCallback, useEffect, useState } from "react"
import type { TwitterUser } from "@/data/api/backendSparkApi"
import {
  MINI_ACTIVE_WALLET_STORAGE_KEY,
  MINI_TOKEN_STORAGE_KEY,
  MINI_USER_STORAGE_KEY,
  type MiniWalletType,
} from "@/data/api/miniApi"

function safeReadString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeReadUser(): TwitterUser | null {
  const raw = safeReadString(MINI_USER_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TwitterUser
    if (!parsed?.id || !parsed?.username) return null
    return parsed
  } catch {
    return null
  }
}

function safeReadWalletType(): MiniWalletType {
  const raw = safeReadString(MINI_ACTIVE_WALLET_STORAGE_KEY)
  return raw === "private" ? "private" : "public"
}

export function useMiniAuth() {
  const [token, setToken] = useState<string | null>(() => safeReadString(MINI_TOKEN_STORAGE_KEY))
  const [user, setUser] = useState<TwitterUser | null>(() => safeReadUser())
  const [activeWalletType, setActiveWalletTypeState] = useState<MiniWalletType>(() => safeReadWalletType())

  // Cross-tab sync: if the user logs out in another tab, mirror here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MINI_TOKEN_STORAGE_KEY) {
        setToken(e.newValue)
      } else if (e.key === MINI_USER_STORAGE_KEY) {
        setUser(safeReadUser())
      } else if (e.key === MINI_ACTIVE_WALLET_STORAGE_KEY) {
        setActiveWalletTypeState(safeReadWalletType())
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const login = useCallback((newToken: string, newUser: TwitterUser) => {
    try {
      localStorage.setItem(MINI_TOKEN_STORAGE_KEY, newToken)
      localStorage.setItem(MINI_USER_STORAGE_KEY, JSON.stringify(newUser))
    } catch {
      /* no-op: quota or private mode */
    }
    setToken(newToken)
    setUser(newUser)
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(MINI_TOKEN_STORAGE_KEY)
      localStorage.removeItem(MINI_USER_STORAGE_KEY)
      // Clear the per-session deposit-gate cache so a different user
      // logging into the same browser doesn't inherit the previous
      // user's "already onboarded" bypass. The server would correct
      // them eventually, but the flash of a protected page would be bad.
      localStorage.removeItem("spark_mini_deposit_completed")
      // Stale-while-revalidate caches are user-specific (balances,
      // wallets, "deposit completed" flag) — wipe them on logout so
      // the next user's cold open shows their OWN data placeholder,
      // not the previous user's. Hackathons list is global so we
      // can leave it; clearing it would just slow the next open.
      localStorage.removeItem("spark_mini_cache_me")
      // Intentionally keep the active wallet preference so re-login lands
      // the user on the same wallet they picked last time.
    } catch {
      /* no-op */
    }
    setToken(null)
    setUser(null)
  }, [])

  const setActiveWalletType = useCallback((t: MiniWalletType) => {
    try {
      localStorage.setItem(MINI_ACTIVE_WALLET_STORAGE_KEY, t)
    } catch {
      /* no-op */
    }
    setActiveWalletTypeState(t)
  }, [])

  return {
    token,
    user,
    isAuthenticated: !!token && !!user,
    activeWalletType,
    setActiveWalletType,
    login,
    logout,
  }
}
