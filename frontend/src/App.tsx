import { useEffect } from "react"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import "./i18n/i18n"

import Header from "./components/Header/Header"
import Footer from "./components/Footer/Footer"
import EnvBanner from "./components/EnvBanner"
import SparkLayout from "./components/SparkLanding/SparkLayout"
import OnboardingModal from "./components/OnboardingModal"
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt"
import * as Sentry from "@sentry/react"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
  tracesSampleRate: 1.0,
  environment: import.meta.env.VITE_ENVIRONMENT_TYPE,
})

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Capture referral code from URL (?ref=CODE) and store in localStorage
  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode) {
      localStorage.setItem('spark_referral_code', refCode);
      searchParams.delete('ref');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // iPhone PWA fix: iOS Safari uses the *current* URL at "Add to Home
  // Screen" time instead of the manifest's `start_url`. Users who bookmark
  // the install prompt from `/` end up opening the PWA on `/` every launch,
  // which shows the desktop landing page instead of the mini-app.
  //
  // When the app is running standalone (home-screen launch) on an iOS
  // device and we land on `/`, redirect to `/m`. Android/desktop respect
  // the manifest `start_url` so we don't touch them.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (location.pathname !== '/') return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent || '';
    const isIos =
      /iPhone|iPad|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
    const isStandalone =
      nav.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches;
    if (isIos && isStandalone) {
      navigate('/mini-app', { replace: true });
    }
  }, [location.pathname, navigate]);

  const isLandingPage = location.pathname === '/';
  const isIdeasPage = location.pathname === '/ideas' || location.pathname.startsWith('/ideas/') || 
    location.pathname === '/teams' || location.pathname === '/explanation' || location.pathname === '/roadmap';
  const isPublicProfile = location.pathname.startsWith('/profile/');
  const isHackathonSection = location.pathname.startsWith('/hackathons') ||
    location.pathname.startsWith('/builders') ||
    location.pathname === '/profile';
  // Mini-app (/mini-app/*) ships its own `MiniLayout` with a mobile bottom
  // nav — SparkLayout would inject a desktop header + back button on top,
  // which breaks the PWA chrome we want.
  const isMiniApp = location.pathname === '/mini-app' || location.pathname.startsWith('/mini-app/');

  // Get page title based on route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/discover') return 'Discover';
    if (path === '/projects') return 'Explore';
    if (path === '/search') return 'Search';
    if (path === '/apply') return 'Apply';
    if (path === '/volume') return 'Volume';
    if (path === '/fees') return 'Fees';
    if (path === '/ideas') return 'Ideas';
    return undefined; // No title for other pages
  };

  if (isLandingPage || isIdeasPage || isPublicProfile || isHackathonSection || isMiniApp) {
    // Landing page, Ideas page, and Public Profile have their own layout
    return (
      <>
        <PwaUpdatePrompt />
        {/* <OnboardingModal /> */}
        <ToastContainer />
        <Outlet />
      </>
    );
  }

  // All other pages use the Spark layout
  return (
    <SparkLayout pageTitle={getPageTitle()} showFooter={false}>
      <PwaUpdatePrompt />
      {/* <OnboardingModal /> */}
      <ToastContainer />
      <Outlet />
    </SparkLayout>
  );
}

export default App
