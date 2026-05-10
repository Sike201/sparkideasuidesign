import { Button, ButtonColor, ButtonSize } from "@/components/Button/Button"
import { useWalletContext } from "@/hooks/useWalletContext"
import { SimpleModal } from "@/components/Modal/SimpleModal.tsx"
import { useEffect, useState } from "react"
import { AvailableIcons, Icon } from "@/components/Icon/Icon.tsx"
import { twMerge } from "tailwind-merge"
import CheckboxField from "@/components/InputField/CheckboxField.tsx"

type ConnectButtonProps = {
  btnClassName?: string
  customBtnText?: string
  size?: ButtonSize
  color?: ButtonColor
  isLoading?: boolean
}

/**
 * Connect button which opens a modal for choosing a wallet to connect to.
 * @constructor
 */
export const ConnectButton = ({
  btnClassName,
  customBtnText = "Connect Wallet",
  size,
  color,
  isLoading = false,
}: ConnectButtonProps) => {
  const { walletState, truncatedAddress, connectWithPhantom, connectWithBackpack, connectWithSolflare, signOut, setIsConnectedWithLedger } =
    useWalletContext()

  const [showModal, setShowModal] = useState(false)
  const [showNoWallet, setShowNoWallet] = useState(false)
  const [isUsingLedger, setIsUsingLedger] = useState(() => {
    const storedValue = localStorage.getItem("isUsingLedger")
    return storedValue === "true"
  })

  useEffect(() => {
    if (walletState === "CONNECTED") {
      setShowModal(false)
    }
  }, [walletState, showModal])

  useEffect(() => {
    setIsConnectedWithLedger(isUsingLedger)
    localStorage.setItem("isUsingLedger", isUsingLedger.toString())
    console.log("Stored Ledger preference in localStorage:", isUsingLedger)
  }, [isUsingLedger, setIsConnectedWithLedger])

  const btnText =
    walletState === "NOT_CONNECTED"
      ? customBtnText
      : walletState === "CONNECTING"
        ? "Connecting..."
        : walletState === "CONNECTED"
          ? truncatedAddress
          : "Unknown Status"

  function onClick() {
    if (walletState === "NOT_CONNECTED") {
      setShowModal(true)
    } else if (walletState === "CONNECTED") {
      confirm("Disconnect wallet?") && signOut()
    }
  }

  return (
    <>
      <Button
        onClick={onClick}
        size={size || "xs"}
        color={color || "primary"}
        btnText={btnText}
        className={btnClassName}
        isLoading={isLoading}
      />
      {showModal && (
        <SimpleModal
          className="md:w-1/2"
          showCloseBtn={true}
          title={!showNoWallet ? "Connect a Solana Wallet" : "No wallet?"}
          onClose={() => {
            setShowModal(false)
            setShowNoWallet(false)
          }}
        >
          <div className="flex flex-col items-center justify-center max-sm:h-full">
            {showNoWallet ? (
              <NoWalletModalContent close={() => setShowNoWallet(false)} />
            ) : (
              <div className={twMerge("flex w-full grow flex-col justify-start", "px-4 pt-4 lg:px-10 lg:pt-10")}>
                <div
                  className={twMerge(
                    "flex w-full flex-col items-center justify-center lg:flex-row",
                    "gap-4 md:gap-3",
                  )}
                >
                  <WalletProvider icon={"SvgPhantom"} label={"Phantom"} onClick={connectWithPhantom} />
                  <WalletProvider icon={"SvgBackpack"} label={"Backpack"} onClick={connectWithBackpack} />
                  <WalletProvider icon={"SvgSolflare"} label={"Solflare"} onClick={connectWithSolflare} />
                </div>
                <div className="mt-4 flex justify-center">
                  <CheckboxField
                    inputClassName="text-white!"
                    label={
                      <p className="text-fg-secondary">
                        I am using a Ledger hardware wallet
                      </p>
                    }
                    value={isUsingLedger}
                    onChange={setIsUsingLedger}
                  />
                </div>
                <div className="mb-8 mt-4 lg:mt-5">
                  <p
                    onClick={() => setShowNoWallet(true)}
                    className="cursor-pointer select-none p-3 text-center text-fg-primary hover:underline"
                  >
                    I don&apos;t have a wallet
                  </p>
                </div>
              </div>
            )}
          </div>
        </SimpleModal>
      )}
    </>
  )
}
function NoWalletModalContent({ close }: { close: () => void }) {
  return (
    <div
      className={twMerge(
        "flex w-full grow flex-col items-center justify-start lg:justify-center",
        "gap-5 px-10 pb-8 pt-14 lg:pt-3",
      )}
    >
      <p className="text-body-l-regular text-fg-tertiary">New to DeFI? Create a wallet now:</p>
      <WalletProvider
        icon={"SvgPhantom"}
        label={"Create a Phantom Wallet"}
        onClick={() => window.open("https://phantom.app", "_blank")}
      />
      <p className="text-center text-fg-secondary">
        Phantom is a robust, multi-chain wallet
        <br />
        trusted by over 3 million users.
      </p>
    </div>
  )
}

type WalletProviderProps = {
  icon: AvailableIcons
  label: string
  onClick: () => void
}

function WalletProvider({ icon, label, onClick }: WalletProviderProps) {
  const className = twMerge(
    "flex flex-col items-center justify-center gap-4",
    "p-[40px]",
    "w-full border border-bd-primary rounded-2xl hover:bg-tertiary cursor-pointer",
  )
  return (
    <div onClick={onClick} className={className}>
      <Icon className="text-[60px]" icon={icon} />
      <p className="text-body-l-medium text-white">{label}</p>
    </div>
  )
}
