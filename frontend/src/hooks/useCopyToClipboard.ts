import { useState } from "react"

const COPIED_TIMEOUT_MS = 2000

type UseCopyToClipboardOutput = {
  isCopied: boolean
  copyToClipboard: (value: string) => void
}

export const useCopyToClipboard = (): UseCopyToClipboardOutput => {
  const [isCopied, setCopied] = useState(false)

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value)

    setCopied(true)
    // reset the label after a timeout
    setTimeout(() => setCopied(false), COPIED_TIMEOUT_MS)
  }

  return { isCopied, copyToClipboard }
}
