import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useWalletContext } from '@/hooks/useWalletContext';
import {
  UserProfile,
  loadUserProfile,
  saveUserProfile,
  getRemainingVotes,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "@/components/Ideas";

export interface UseIdeasAuthReturn {
  userProfile: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  remainingVotes: number;
  setRemainingVotes: React.Dispatch<React.SetStateAction<number>>;
  isConnectingX: boolean;
  isConnectingWallet: boolean;
  isProfileDropdownOpen: boolean;
  setIsProfileDropdownOpen: (open: boolean) => void;
  isSubmitModalOpen: boolean;
  setIsSubmitModalOpen: (open: boolean) => void;
  isShareModalOpen: boolean;
  setIsShareModalOpen: (open: boolean) => void;
  isWalletSelectorOpen: boolean;
  setIsWalletSelectorOpen: (open: boolean) => void;
  connectX: () => Promise<void>;
  disconnectX: () => void;
  connectWallet: () => void;
  disconnectWallet: () => void;
  handleWalletSelected: (address: string) => Promise<void>;
}

export function useIdeasAuth(): UseIdeasAuthReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // User profile state
  const [userProfile, setUserProfile] = useState<UserProfile>(loadUserProfile);
  const [remainingVotes, setRemainingVotes] = useState(getRemainingVotes());

  // Wallet context (shared with hackathons)
  const { address: ctxAddress, walletState, signOut: ctxSignOut } = useWalletContext();

  // UI state
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isConnectingX, setIsConnectingX] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);

  // Sync wallet context connection with user profile
  useEffect(() => {
    if (walletState === 'CONNECTED' && ctxAddress) {
      setUserProfile(prev => {
        if (prev.walletAddress === ctxAddress) return prev;
        const newProfile: UserProfile = {
          ...prev,
          walletAddress: ctxAddress,
          walletConnected: true,
        };
        saveUserProfile(newProfile);
        // If there's a pending referral code, open the profile dropdown so user can apply it
        const pendingRef = localStorage.getItem('spark_referral_code');
        if (pendingRef) {
          const showCount = parseInt(localStorage.getItem('spark_referral_shown') || '0', 10);
          if (showCount < 2) {
            setIsProfileDropdownOpen(true);
            localStorage.setItem('spark_referral_shown', (showCount + 1).toString());
          } else {
            // Shown 3 times without applying — stop nagging
            localStorage.removeItem('spark_referral_code');
            localStorage.removeItem('spark_referral_shown');
          }
        }
        return newProfile;
      });
    } else if (walletState === 'NOT_CONNECTED') {
      setUserProfile(prev => {
        if (!prev.walletConnected) return prev;
        const newProfile: UserProfile = {
          ...prev,
          walletAddress: undefined,
          walletConnected: false,
        };
        saveUserProfile(newProfile);
        return newProfile;
      });
    }
  }, [walletState, ctxAddress]);

  // Handle Twitter OAuth callback
  const handleTwitterCallback = useCallback(async (code: string, state: string) => {
    setIsConnectingX(true);
    try {
      const storedState = localStorage.getItem('twitter_oauth_state');
      const storedTimestamp = localStorage.getItem('twitter_oauth_timestamp');

      if (storedTimestamp) {
        const elapsed = Date.now() - parseInt(storedTimestamp, 10);
        if (elapsed > 5 * 60 * 1000) {
          throw new Error('OAuth session expired. Please try again.');
        }
      }

      if (state !== storedState) {
        console.error('State mismatch:', { received: state, stored: storedState });
        throw new Error('State mismatch - please try connecting again');
      }

      const codeVerifier = localStorage.getItem('twitter_code_verifier');
      if (!codeVerifier) {
        throw new Error('Code verifier not found - please try connecting again');
      }

      const redirectUri = `${window.location.origin}/ideas`;

      const response = await fetch('/api/twitter-oauth-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: redirectUri, code_verifier: codeVerifier })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to exchange token');
      }

      const data = await response.json();

      const newProfile: UserProfile = {
        ...loadUserProfile(),
        xId: data.user.id,
        xUsername: data.user.username,
        xName: data.user.name,
        xAvatar: data.user.profile_image_url || `https://unavatar.io/twitter/${data.user.username}`,
        xConnected: true,
      };
      setUserProfile(newProfile);
      saveUserProfile(newProfile);

      if (newProfile.walletAddress) {
        try {
          await fetch('/api/link-wallet-to-twitter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              twitterId: data.user.id,
              walletAddress: newProfile.walletAddress,
            }),
          }).catch(err => console.error('Failed to link wallet:', err));
        } catch (error) {
          console.error('Failed to link wallet to Twitter:', error);
        }
      }

      const returnPath = localStorage.getItem('twitter_oauth_return_path') || '/ideas';
      localStorage.removeItem('twitter_code_verifier');
      localStorage.removeItem('twitter_oauth_state');
      localStorage.removeItem('twitter_oauth_timestamp');
      localStorage.removeItem('twitter_oauth_return_path');
      navigate(returnPath, { replace: true });
      // Reopen submit modal if it was open before OAuth redirect
      if (localStorage.getItem('spark_reopen_submit_modal')) {
        setIsSubmitModalOpen(true);
        // Flag will be cleaned up by the modal component
      }
    } catch (error) {
      console.error('Twitter OAuth callback failed:', error);
      const returnPath = localStorage.getItem('twitter_oauth_return_path') || '/ideas';
      localStorage.removeItem('twitter_code_verifier');
      localStorage.removeItem('twitter_oauth_state');
      localStorage.removeItem('twitter_oauth_timestamp');
      localStorage.removeItem('twitter_oauth_return_path');
      localStorage.removeItem('spark_reopen_submit_modal');
      toast.error(`Failed to connect to X: ${error instanceof Error ? error.message : 'Unknown error'}`);
      navigate(returnPath, { replace: true });
    } finally {
      setIsConnectingX(false);
    }
  }, [navigate]);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (code && state) {
      handleTwitterCallback(code, state);
    }
  }, [searchParams, handleTwitterCallback]);

  // Connect X
  const connectX = async () => {
    setIsConnectingX(true);
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateState();

      localStorage.setItem('twitter_code_verifier', codeVerifier);
      localStorage.setItem('twitter_oauth_state', state);
      localStorage.setItem('twitter_oauth_timestamp', Date.now().toString());
      localStorage.setItem('twitter_oauth_return_path', window.location.pathname + window.location.search);
      // Preserve submit modal state across OAuth redirect
      if (isSubmitModalOpen) {
        localStorage.setItem('spark_reopen_submit_modal', 'true');
      }

      const redirectUri = `${window.location.origin}/ideas`;

      const response = await fetch('/api/twitter-oauth-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uri: redirectUri,
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate OAuth URL');
      }

      const data = await response.json();
      window.location.href = data.authUrl;
    } catch (error) {
      console.error("Failed to initiate X connection:", error);
      toast.error(`Failed to connect to X: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsConnectingX(false);
    }
  };

  // Disconnect X
  const disconnectX = () => {
    const newProfile: UserProfile = {
      ...userProfile,
      xId: undefined,
      xUsername: undefined,
      xName: undefined,
      xAvatar: undefined,
      xConnected: false,
    };
    setUserProfile(newProfile);
    saveUserProfile(newProfile);
  };

  // Connect Wallet
  const connectWallet = () => {
    setIsWalletSelectorOpen(true);
  };

  // Handle wallet selected from modal
  const handleWalletSelected = async (address: string) => {
    const newProfile: UserProfile = {
      ...userProfile,
      walletAddress: address,
      walletConnected: true,
    };
    setUserProfile(newProfile);
    saveUserProfile(newProfile);
    setIsWalletSelectorOpen(false);

    // If there's a pending referral code, open the profile dropdown so user can apply it
    if (localStorage.getItem('spark_referral_code')) {
      setIsProfileDropdownOpen(true);
    }

    if (userProfile.xConnected && userProfile.xId) {
      try {
        await fetch('/api/link-wallet-to-twitter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            twitterId: userProfile.xId,
            walletAddress: address,
          }),
        }).catch(err => console.error('Failed to link wallet:', err));
      } catch (error) {
        console.error('Failed to link wallet to Twitter:', error);
      }
    }
  };

  // Disconnect Wallet
  const disconnectWallet = () => {
    ctxSignOut();
    const newProfile: UserProfile = {
      ...userProfile,
      walletAddress: undefined,
      walletConnected: false,
    };
    setUserProfile(newProfile);
    saveUserProfile(newProfile);
  };

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isProfileDropdownOpen && !target.closest('[data-profile-dropdown]')) {
        setIsProfileDropdownOpen(false);
      }
    };

    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isProfileDropdownOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsSubmitModalOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    userProfile,
    setUserProfile,
    remainingVotes,
    setRemainingVotes,
    isConnectingX,
    isConnectingWallet,
    isProfileDropdownOpen,
    setIsProfileDropdownOpen,
    isSubmitModalOpen,
    setIsSubmitModalOpen,
    isShareModalOpen,
    setIsShareModalOpen,
    isWalletSelectorOpen,
    setIsWalletSelectorOpen,
    connectX,
    disconnectX,
    connectWallet,
    disconnectWallet,
    handleWalletSelected,
  };
}
