import { ReactNode } from "react";
import { WalletSelector } from "@/components/Ideas/WalletSelector";
import { IdeasHeader, SubmitIdeaModal, ShareModal } from "@/components/Ideas";
import Aurora from "@/components/Aurora";
import type { UseIdeasAuthReturn } from "@/hooks/useIdeasAuth";
import type { UseIdeasDataReturn } from "@/hooks/useIdeasData";
import type { ViewType } from "./types";

const AURORA_STOPS = ["#431407", "#ea580c", "#fdba74"];

interface IdeasLayoutProps {
  auth: UseIdeasAuthReturn;
  ideasData: UseIdeasDataReturn;
  children: ReactNode;
}

export default function IdeasLayout({ auth, ideasData, children }: IdeasLayoutProps) {
  const switchView = (_view: ViewType) => {};

  return (
    <div className="relative min-h-screen bg-black text-white antialiased selection:bg-orange-500/20 selection:text-orange-200">
      <div className="pointer-events-none fixed inset-0 z-0 bg-black">
        <div className="h-full w-full origin-center -scale-y-100 opacity-[0.34]">
          <Aurora colorStops={AURORA_STOPS} amplitude={1} blend={0.5} />
        </div>
      </div>

      <WalletSelector
        isOpen={auth.isWalletSelectorOpen}
        onClose={() => auth.setIsWalletSelectorOpen(false)}
        onWalletSelected={auth.handleWalletSelected}
      />

      <IdeasHeader
        currentView="ideas"
        onViewChange={switchView}
        userProfile={auth.userProfile}
        remainingVotes={auth.remainingVotes}
        isProfileDropdownOpen={auth.isProfileDropdownOpen}
        setIsProfileDropdownOpen={auth.setIsProfileDropdownOpen}
        onOpenSubmitModal={() => auth.setIsSubmitModalOpen(true)}
        onConnectX={auth.connectX}
        onDisconnectX={auth.disconnectX}
        onConnectWallet={auth.connectWallet}
        onDisconnectWallet={auth.disconnectWallet}
        isConnectingX={auth.isConnectingX}
        isConnectingWallet={auth.isConnectingWallet}
      />

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-10 md:px-12 md:pt-16">{children}</main>

      <SubmitIdeaModal
        isOpen={auth.isSubmitModalOpen}
        onClose={() => auth.setIsSubmitModalOpen(false)}
        onSubmit={ideasData.handleSubmitIdea}
        userProfile={auth.userProfile}
        onConnectX={auth.connectX}
        onDisconnectX={auth.disconnectX}
        isConnectingX={auth.isConnectingX}
        onConnectWallet={auth.connectWallet}
        onDisconnectWallet={auth.disconnectWallet}
        isConnectingWallet={auth.isConnectingWallet}
      />

      {ideasData.selectedIdea && (
        <ShareModal
          isOpen={auth.isShareModalOpen}
          onClose={() => auth.setIsShareModalOpen(false)}
          idea={ideasData.selectedIdea}
        />
      )}
    </div>
  );
}
