import { useAuthContext } from "@/hooks/useAuthContext"
import { useWalletContext } from "@/hooks/useWalletContext"
import React, { PropsWithChildren, Suspense } from "react"
import SimpleLoader from "../Loaders/SimpleLoader"
import { ConnectButton } from "../Header/ConnectButton"

const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const { isPending, isSignedIn } = useAuthContext()
  const { address, isWalletConnected } = useWalletContext()

  if (!address || !isWalletConnected) {
    return (
      <div className="flex w-full flex-col items-center py-40 gap-5 min-h-[100vh]">
        <span className="text-2xl">Back Office Dashboard</span>
        <ConnectButton btnClassName="w-full max-w-[320px]" />
      </div>
    )
  }

  if (!isSignedIn || isPending) {
    return (
      <div className="flex w-full flex-col gap-10 py-40 items-center">
        <span className="text-white">{"Loading..."}</span>
        <SimpleLoader className="text-5xl" />
      </div>
    )
  } 

  return <Suspense>{children}</Suspense>
}

export default ProtectedRoute
