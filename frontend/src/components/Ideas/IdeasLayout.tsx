import { ReactNode } from "react";
import { WalletSelector } from '@/components/Ideas/WalletSelector';
import { IdeasHeader, SubmitIdeaModal, ShareModal } from "@/components/Ideas";
import type { UseIdeasAuthReturn } from "@/hooks/useIdeasAuth";
import type { UseIdeasDataReturn } from "@/hooks/useIdeasData";
import type { ViewType } from "./types";

interface IdeasLayoutProps {
  auth: UseIdeasAuthReturn;
  ideasData: UseIdeasDataReturn;
  children: ReactNode;
}

export default function IdeasLayout({ auth, ideasData, children }: IdeasLayoutProps) {
  const switchView = (_view: ViewType) => {
    // Navigation is now handled by <Link> in IdeasHeader
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white antialiased selection:bg-orange-500/20 selection:text-orange-400">
      {/* Subtle background effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-orange-500/[0.03] rounded-full blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)`,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <WalletSelector
        isOpen={auth.isWalletSelectorOpen}
        onClose={() => auth.setIsWalletSelectorOpen(false)}
        onWalletSelected={auth.handleWalletSelected}
      />

      <IdeasHeader
        currentView={"ideas"}
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

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {children}
      </main>

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

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        }
      `}</style>
    </div>
  );
}
