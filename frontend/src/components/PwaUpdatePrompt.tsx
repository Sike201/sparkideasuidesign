import { useEffect, useRef } from 'react';

/**
 * Component to handle PWA updates and force reload when new version is available
 * This component automatically checks for service worker updates and reloads the page when available
 */
export function PwaUpdatePrompt() {
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Function to check for updates
    const checkForUpdates = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      } catch (error) {
        console.error('Error checking for service worker updates:', error);
      }
    };

    // Check for updates immediately
    checkForUpdates();

    // Check for updates every 30 seconds
    updateIntervalRef.current = setInterval(checkForUpdates, 30000);

    // Check for updates when window gains focus
    const handleFocus = () => {
      checkForUpdates();
    };

    // Check for updates when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkForUpdates();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for service worker updates
    const handleControllerChange = () => {
      // Service worker has been updated, reload the page
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Listen for messages from service worker about updates
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SKIP_WAITING') {
        window.location.reload();
      }
    });

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null; // This component doesn't render anything
}
