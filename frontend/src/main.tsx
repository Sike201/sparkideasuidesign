import { lazy, Component, type ReactNode } from "react"
import ReactDOM from "react-dom/client"
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Outlet, RouterProvider, createBrowserRouter } from "react-router-dom"
import App from "./App"

import "./index.css"

import { HelmetProvider } from "react-helmet-async"
import { Buffer } from "buffer"
import { toast } from "react-toastify"
import { ROUTES } from "./utils/routes"
import { AuthProvider } from "./hooks/useAuthContext"
import ProtectedRoute from "./components/BackOffice/ProtectedRoute"
import Providers from "./providers/SolanaWalletProvider"
import PwaInstall from "./pages/PwaInstall"
import IdeasPage from "./pages/IdeasPage"
import IdeaDetailPage from "./pages/IdeaDetailPage"
import FundedPage from "./pages/FundedPage"
import ExplanationPage from "./pages/ExplanationPage"
import PublicProfile from "./pages/PublicProfile"
import IdeaLandingPage from "./pages/IdeaLandingPage"
import HackathonsPage from "./pages/HackathonsPage"
import HackathonDetailPage from "./pages/HackathonDetailPage"
import HackathonApplyPage from "./pages/HackathonApplyPage"
import BuildersPage from "./pages/BuildersPage"
import BuilderProfilePage from "./pages/BuilderProfilePage"
import MyProfilePage from "./pages/MyProfilePage"
import OAuthCallbackPage from "./pages/OAuthCallbackPage"
import LandingPageV2 from "./pages/LandingPageV2"
import MiniLandingPage from "./pages/mini/MiniLandingPage"
import MiniDepositPage from "./pages/mini/MiniDepositPage"
import MiniHackathonsPage from "./pages/mini/MiniHackathonsPage"
import MiniHackathonDetailPage from "./pages/mini/MiniHackathonDetailPage"
import MiniTradePage from "./pages/mini/MiniTradePage"
import MiniMePage from "./pages/mini/MiniMePage"
window.Buffer = Buffer

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => toast.error(error.message, { theme: "colored" }),
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

const BackOfficeDashboard = lazy(() => import("./pages/BackOfficeDashboard"))
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"))
// Static legal pages required by the Solana dApp Store. Lazy-loaded
// since they're only ever hit from external links (publisher portal,
// app store listing) and never appear in the typical user funnel.
const TermsPage = lazy(() => import("./pages/TermsPage"))
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"))

const router = createBrowserRouter([
  {
    // Mini-app — mobile-only Twitter-auth trading surface.
    // No wallet adapters: custody is managed server-side.
    // Separated so TWA (Android) doesn't load browser-extension wallets.
    path: ROUTES.MINI,
    element: (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    ),
    children: [
      { path: "", element: <MiniLandingPage /> },
      { path: "deposit", element: <MiniDepositPage /> },
      { path: "me", element: <MiniMePage /> },
      { path: "hackathons", element: <MiniHackathonsPage /> },
      { path: "hackathons/:id", element: <MiniHackathonDetailPage /> },
      { path: "trade", element: <MiniTradePage /> },
      { path: "trade/:proposalPda", element: <MiniTradePage /> },
    ],
  },
  {
    path: "/",
    element: (
      <QueryClientProvider client={queryClient}>
        <Providers>
          <App />
        </Providers>
      </QueryClientProvider>
    ),
    children: [
      {
        path: ROUTES.LANDING_PAGE,
        element: <LandingPageV2 />,
      },
      {
        path: ROUTES.PUBLIC_PROFILE,
        element: <PublicProfile />,
      },
      {
        path: ROUTES.IDEAS,
        element: <Outlet />,
        children: [
          {
            path: ":slug/landing",
            element: <IdeaLandingPage />,
          },
          {
            path: ":slug",
            element: <IdeaDetailPage />,
          },
          {
            path: "",
            element: <IdeasPage />,
          },
        ],
      },
      {
        path: ROUTES.EXPLANATION,
        element: <ExplanationPage />,
      },
      {
        path: ROUTES.ROADMAP,
        element: <ExplanationPage />,
      },
      {
        path: ROUTES.FUNDED,
        element: <FundedPage />,
      },
      {
        path: ROUTES.HACKATHONS,
        element: <Outlet />,
        children: [
          {
            path: ":id/apply",
            element: <HackathonApplyPage />,
          },
          {
            path: ":id",
            element: <HackathonDetailPage />,
          },
          {
            path: "",
            element: <HackathonsPage />,
          },
        ],
      },
      {
        path: ROUTES.BUILDERS,
        element: <Outlet />,
        children: [
          {
            path: ":username",
            element: <BuilderProfilePage />,
          },
          {
            path: "",
            element: <BuildersPage />,
          },
        ],
      },
      {
        path: ROUTES.MY_PROFILE,
        element: <MyProfilePage />,
      },
      {
        path: ROUTES.OAUTH_CALLBACK,
        element: <OAuthCallbackPage />,
      },
      {
        path: ROUTES.BACK_OFFICE,
        element: (
          <AuthProvider>
            <ProtectedRoute>
              <BackOfficeDashboard />
            </ProtectedRoute>
          </AuthProvider>
        ),
      },
      {
        path: "/terms-of-use",
        loader: () => {
          window.location.href = ROUTES.TERMS_OF_USE;
          return null;
        },
        element: null,
      },
      {
        path: ROUTES.TERMS_AND_CONDITIONS,
        element: <TermsAndConditions />,
      },
      {
        path: ROUTES.TERMS,
        element: <TermsPage />,
      },
      {
        path: ROUTES.PRIVACY,
        element: <PrivacyPage />,
      },
      {
        path: "/pwa-install",
        element: <PwaInstall />,
      },
    ],
  },
])

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem", background: "#030303", color: "#fff", fontFamily: "sans-serif" }}>
          <p style={{ fontSize: "1.25rem" }}>Something went wrong</p>
          <button onClick={() => window.location.reload()} style={{ padding: "0.5rem 1.5rem", borderRadius: "0.5rem", background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: "1rem" }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </HelmetProvider>,
)
