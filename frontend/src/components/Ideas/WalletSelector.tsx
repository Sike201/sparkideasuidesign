import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useWalletContext } from '@/hooks/useWalletContext';
import { SvgPhantom } from '@/components/Icon/Svg/SvgPhantom';
import { SvgBackpack } from '@/components/Icon/Svg/SvgBackpack';
import { SvgSolflare } from '@/components/Icon/Svg/SvgSolflare';
import { SvgJupiter } from '@/components/Icon/Svg/SvgJupiter';

interface WalletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletSelected: (address: string) => void;
}

const WALLETS = [
  { label: 'Phantom', icon: SvgPhantom, key: 'PHANTOM' as const },
  { label: 'Backpack', icon: SvgBackpack, key: 'BACKPACK' as const },
  { label: 'Solflare', icon: SvgSolflare, key: 'SOLFLARE' as const },
  { label: 'Jupiter', icon: SvgJupiter, key: 'JUPITER' as const },
];

export function WalletSelector({ isOpen, onClose, onWalletSelected }: WalletSelectorProps) {
  const { walletState, address, connectWithPhantom, connectWithBackpack, connectWithSolflare, connectWithJupiter } = useWalletContext();
  const hasNotifiedRef = useRef(false);

  const connectFns: Record<string, () => void> = {
    PHANTOM: connectWithPhantom,
    BACKPACK: connectWithBackpack,
    SOLFLARE: connectWithSolflare,
    JUPITER: connectWithJupiter,
  };

  const handleWalletSelect = (key: string) => {
    hasNotifiedRef.current = false;
    connectFns[key]?.();
  };

  // When connection succeeds while modal is open, notify parent
  useEffect(() => {
    if (walletState === 'CONNECTED' && address && isOpen && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      onWalletSelected(address);
      onClose();
    }
  }, [walletState, address, isOpen, onWalletSelected, onClose]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasNotifiedRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md mx-4 p-6 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white font-satoshi">Select a Wallet</h3>
          <button
            onClick={onClose}
            className="text-neutral-600 hover:text-white transition-colors duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          {WALLETS.map((w) => {
            const Icon = w.icon;
            return (
              <button
                key={w.key}
                onClick={() => handleWalletSelect(w.key)}
                disabled={walletState === 'CONNECTING'}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-orange-500/20 hover:bg-white/[0.05] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 flex items-center justify-center">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-white font-satoshi">{w.label}</p>
                </div>
                {walletState === 'CONNECTING' && (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-orange-400 rounded-full animate-spin" />
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-neutral-500 text-center mt-4 font-geist">
          New to DeFi?{' '}
          <a
            href="https://phantom.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300 underline"
          >
            Get Phantom
          </a>
        </p>
      </div>
    </div>
  );
}
