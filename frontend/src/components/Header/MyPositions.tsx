import React, { MutableRefObject, useRef, useState } from "react"
import { AvailableIcons, Icon } from "../Icon/Icon"
import { twMerge } from "tailwind-merge"
import { SupportedWallet, useWalletContext } from "@/hooks/useWalletContext"
import { useCheckOutsideClick } from "@/hooks/useCheckOutsideClick"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { MyPositionTabId } from "@/@types/frontend"
import MyPositionInvestments from "./MyPosition/MyPositionInvestments"
import MyPositionTabButton from "./MyPosition/MyPositionTabButton"
import DropdownMenuButton from "./MyPosition/DropdownMenuButton"
import MyPositionCommitments from "./MyPosition/MyPositionCommitments"
import { useQuery } from "@tanstack/react-query"
import { backendSparkApi } from "@/data/api/backendSparkApi"

type Props = {
  onClose: () => void
  excludeOnClickOutside: MutableRefObject<HTMLDivElement | null>[]
}
const tabsOptions: { id: MyPositionTabId; label: string }[] = [
  {
    label: "POOLS",
    id: "POOLS",
  },
  {
    label: "DRAFT PICKS",
    id: "DRAFT_PICKS",
  },
  // {
  //   label: "REFERRALS",
  //   id: "REFERRALS",
  // },
]
const displayTabs: Record<MyPositionTabId, JSX.Element> = {
  POOLS: <MyPositionInvestments />,
  DRAFT_PICKS: <MyPositionCommitments />,
  // REFERRALS: <span>referrals</span>,
}

const MyPositions = ({ onClose, excludeOnClickOutside }: Props) => {
  const { address, truncatedAddress, signOut, walletProvider } = useWalletContext()
  const [activeTab, setActiveTab] = useState<MyPositionTabId>("POOLS")

  const { data: userPoints } = useQuery({
    queryKey: ['userPoints', address],
    queryFn: () => backendSparkApi.getUserPoints(address),
    enabled: !!address,
    staleTime: 30_000,
  })

  const dropdownMenuRef = useRef<HTMLDivElement | null>(null)
  useCheckOutsideClick(dropdownMenuRef, onClose, excludeOnClickOutside)

  const { isCopied, copyToClipboard } = useCopyToClipboard()

  const iconMap: Record<SupportedWallet | "", AvailableIcons> = {
    BACKPACK: "SvgBackpack",
    PHANTOM: "SvgPhantom",
    SOLFLARE: "SvgSolflare",
    JUPITER: "SvgPhantom",
    "": "SvgX",
  }
  const icon: AvailableIcons = iconMap[walletProvider]

  return (
    <div
      ref={dropdownMenuRef}
      className={twMerge("w-[420px] p-6", "rounded-xl border border-bd-primary bg-default", "flex flex-col gap-4", "")}
    >
      <div className="flex w-full items-center justify-between gap-2">
        {/* left side */}
        <div className="flex items-center gap-4">
          <Icon className="text-[32px]" icon={icon} />
          <p className="select-none text-body-l-medium">{truncatedAddress}</p>
        </div>
        {/* right side */}
        <div className="flex items-center gap-3">
          <DropdownMenuButton
            icon={"SvgCopy"}
            tooltipText={isCopied ? "Copied!" : "Copy Wallet Address"}
            onClick={() => copyToClipboard(address)}
          />
          {/* <DropdownMenuButton icon={"SvgShare"} tooltipText={"Share"} onClick={() => alert("Not implemented!")} /> */}
          <DropdownMenuButton
            icon={"SvgLogOut"}
            tooltipText={"Disconnect"}
            onClick={signOut}
            iconClass="text-fg-error-primary"
          />
        </div>
      </div>
      {/* Points display */}
      <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <span className="text-body-s-medium text-fg-secondary">Points</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-body-l-medium text-orange-400">{(userPoints?.points ?? 0).toLocaleString()}</span>
          {userPoints && userPoints.points > 0 && (
            <span className="text-body-s-medium text-fg-secondary">#{userPoints.rank}</span>
          )}
        </div>
      </div>
      <div className="mb-4 flex w-full">
        {tabsOptions.map((tab) => (
          <MyPositionTabButton key={tab.id} tab={tab} activeTab={activeTab} setActiveTab={setActiveTab} />
        ))}
      </div>
      <div className="flex flex-col gap-6">{displayTabs[activeTab]}</div>
    </div>
  )
}

export default MyPositions
