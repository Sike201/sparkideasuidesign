import { useState } from "react"

const store = localStorage

/**
 * Same as useState, but persists the state across sessions.
 * Doesn't return null ever, but an empty string if not found.
 * Currently backed by localStorage, we can change to sessionStorage anytime.
 * @param key
 */
export function usePersistedState<T extends string>(
  key: string,
): [T, (value: T) => void] {
  const initialValue = (store.getItem(key) || "") as T

  const [stateValue, setStateValue] = useState(initialValue)

  const setValue = (value: T) => {
    store.setItem(key, value)
    setStateValue(value)
  }

  return [stateValue, setValue]
}
