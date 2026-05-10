import { Button } from "@/components/Button/Button"
import { useState } from "react"

import { Icon } from "@/components/Icon/Icon"
import { useWalletContext } from "@/hooks/useWalletContext"
import { ConnectButton } from "@/components/Header/ConnectButton"
import IdeasManager from "@/components/BackOffice/IdeasManager"
import ReferralsManager from "@/components/BackOffice/ReferralsManager"
import HackathonsManager from "@/components/BackOffice/HackathonsManager"
import RedemptionVaultManager from "@/components/BackOffice/RedemptionVaultManager"
import BroadcastNotificationsManager from "@/components/BackOffice/BroadcastNotificationsManager"
import BonusWalletsManager from "@/components/BackOffice/BonusWalletsManager"
import MiniStatsManager from "@/components/BackOffice/MiniStatsManager"

const BACK_OFFICE_FEATURES = ["IDEAS", "REFERRALS", "HACKATHONS", "REDEMPTION_VAULT", "NOTIFICATIONS", "BONUS_WALLETS", "MINI_STATS"] as const
type BackOfficeFeatureType = (typeof BACK_OFFICE_FEATURES)[number]

const BackOfficeDashboard = () => {
  const { isWalletConnected } = useWalletContext()

  const [renderedFeature, setRenderedFeature] = useState<BackOfficeFeatureType | null>(null)

  const renderFeature = () => {
    if (renderedFeature === "IDEAS") {
      return <IdeasManager />
    }
    if (renderedFeature === "REFERRALS") {
      return <ReferralsManager />
    }
    if (renderedFeature === "HACKATHONS") {
      return <HackathonsManager />
    }
    if (renderedFeature === "REDEMPTION_VAULT") {
      return <RedemptionVaultManager />
    }
    if (renderedFeature === "NOTIFICATIONS") {
      return <BroadcastNotificationsManager />
    }
    if (renderedFeature === "BONUS_WALLETS") {
      return <BonusWalletsManager />
    }
    if (renderedFeature === "MINI_STATS") {
      return <MiniStatsManager />
    }
  }

  return (
    <div className="relative flex min-h-[70vh] w-full max-w-[1400px] flex-col gap-6 px-20 py-4 pt-[86px]">
      {/* Header */}
      {!renderedFeature && (
        <header className="flex w-full items-center justify-between p-4 pt-5 shadow">
          <h1 className="w-full text-center text-2xl font-semibold">Back Office Dashboard</h1>
        </header>
      )}

      {isWalletConnected ? (
        <div className="flex flex-1 flex-col gap-4">
          {/* Content Area */}
          {!renderedFeature ? (
            <div className="flex w-full flex-col gap-6">
              {/* Grid wraps tiles to multiple rows so a growing roster of
                  back-office features doesn't push the layout off-screen
                  horizontally. The single-row flex used to overflow once
                  we crossed 6 tiles (the "Mini-app stats" tile pushed the
                  trailing tile under the panel sidebar). */}
              <div className="grid w-full grid-cols-2 justify-center gap-6 md:grid-cols-3 lg:grid-cols-4">
                <div
                  className="flex max-w-[300px] flex-1 cursor-pointer justify-center rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30 p-10 ring-[1px] ring-brand-primary/40 hover:bg-brand-secondary/40"
                  onClick={() => setRenderedFeature("IDEAS")}
                >
                  <span className="w-full text-center text-xl">Ideas</span>
                </div>
                <div
                  className="flex max-w-[300px] flex-1 cursor-pointer justify-center rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30 p-10 ring-[1px] ring-brand-primary/40 hover:bg-brand-secondary/40"
                  onClick={() => setRenderedFeature("REFERRALS")}
                >
                  <span className="w-full text-center text-xl">Referrals</span>
                </div>
                <div
                  className="flex max-w-[300px] flex-1 cursor-pointer justify-center rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30 p-10 ring-[1px] ring-brand-primary/40 hover:bg-brand-secondary/40"
                  onClick={() => setRenderedFeature("HACKATHONS")}
                >
                  <span className="w-full text-center text-xl">Hackathons</span>
                </div>
                <div
                  className="flex max-w-[300px] flex-1 cursor-pointer justify-center rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30 p-10 ring-[1px] ring-brand-primary/40 hover:bg-brand-secondary/40"
                  onClick={() => setRenderedFeature("REDEMPTION_VAULT")}
                >
                  <span className="w-full text-center text-xl">Redemption Vault</span>
                </div>
                <div
                  className="flex max-w-[300px] flex-1 cursor-pointer justify-center rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30 p-10 ring-[1px] ring-brand-primary/40 hover:bg-brand-secondary/40"
                  onClick={() => setRenderedFeature("NOTIFICATIONS")}
                >
                  <span className="w-full text-center text-xl">Notifications</span>
                </div>
                <div
                  className="flex max-w-[300px] flex-1 cursor-pointer justify-center rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30 p-10 ring-[1px] ring-brand-primary/40 hover:bg-brand-secondary/40"
                  onClick={() => setRenderedFeature("BONUS_WALLETS")}
                >
                  <span className="w-full text-center text-xl">Bonus wallets</span>
                </div>
                <div
                  className="flex max-w-[300px] flex-1 cursor-pointer justify-center rounded-xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30 p-10 ring-[1px] ring-brand-primary/40 hover:bg-brand-secondary/40"
                  onClick={() => setRenderedFeature("MINI_STATS")}
                >
                  <span className="w-full text-center text-xl">Mini-app stats</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute left-[10%] top-[100px] z-[11]">
              <Button
                btnText="Back"
                color="tertiary"
                onClick={() => setRenderedFeature(null)}
                prefixElement={<Icon icon="SvgArrowLeft" />}
              />
            </div>
          )}
          {renderFeature()}

        </div>
      ) : (
        <div className="flex justify-center">
          <ConnectButton btnClassName="px-10 py-2" customBtnText="Connect Admin Wallet" />
        </div>
      )}
    </div>
  )
}

export default BackOfficeDashboard
