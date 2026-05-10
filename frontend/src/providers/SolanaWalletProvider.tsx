import { useMemo, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { WalletProvider as CustomWalletProvider } from "@/hooks/useWalletContext";

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

const isTwa = typeof window !== 'undefined' &&
  /Android/.test(navigator.userAgent) &&
  window.matchMedia('(display-mode: standalone)').matches;

export default function Providers({ children }: { children: ReactNode }) {
  // Use mainnet-beta for production
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => isTwa ? [] : [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <CustomWalletProvider>
      <ConnectionProvider endpoint={endpoint}>
        <SolanaWalletProvider wallets={wallets} autoConnect={!isTwa}>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </SolanaWalletProvider>
      </ConnectionProvider>
    </CustomWalletProvider>
  );
}
