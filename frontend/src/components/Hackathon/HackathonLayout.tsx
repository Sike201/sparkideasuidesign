import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogIn, Wallet } from "lucide-react";
import { useWalletContext } from "@/hooks/useWalletContext";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import { generateCodeVerifier, generateCodeChallenge } from "@/components/Ideas/utils";
import { ROUTES } from "@/utils/routes";
import Aurora from "@/components/Aurora";

const AURORA_STOPS = ["#431407", "#ea580c", "#fdba74"];

interface HackathonLayoutProps {
  children: React.ReactNode;
}

export default function HackathonLayout({ children }: HackathonLayoutProps) {
  const location = useLocation();
  const {
    isWalletConnected,
    truncatedAddress,
    connectWithPhantom,
    connectWithBackpack,
    connectWithSolflare,
    connectWithJupiter,
    signOut,
  } = useWalletContext();

  // Check X profile from localStorage (shared with Ideas section)
  const [xProfile, setXProfile] = useState(() => {
    try { const p = localStorage.getItem("spark_user_profile"); return p ? JSON.parse(p) : null; } catch { return null; }
  });
  useEffect(() => {
    const handleStorage = () => {
      try { const p = localStorage.getItem("spark_user_profile"); setXProfile(p ? JSON.parse(p) : null); } catch { /* */ }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleStorage);
    return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener("focus", handleStorage); };
  }, []);
  const isXConnected = xProfile?.xConnected && xProfile?.xUsername;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSection, setMenuSection] = useState<"main" | "wallet">("main");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginSection, setLoginSection] = useState<"main" | "wallet">("main");
  const menuRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !loginOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMenuSection("main");
      }
      if (loginOpen && loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setLoginOpen(false);
        setLoginSection("main");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, loginOpen]);

  const wallets = [
    { name: "Phantom", connect: connectWithPhantom },
    { name: "Solflare", connect: connectWithSolflare },
    { name: "Backpack", connect: connectWithBackpack },
    { name: "Jupiter", connect: connectWithJupiter },
  ];

  const startSocialLogin = async (provider: "twitter" | "github" | "google") => {
    const redirectUri = provider === "twitter"
      ? `${window.location.origin}/ideas`  // Twitter callback via /ideas (handles token exchange + redirect back)
      : `${window.location.origin}/profile`;
    const state = Math.random().toString(36).substring(2, 15);

    sessionStorage.setItem("oauth_provider", provider);
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem("oauth_mode", "login");

    try {
      if (provider === "twitter") {
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        // Store in localStorage (not sessionStorage) so /ideas can read it
        localStorage.setItem("twitter_code_verifier", codeVerifier);
        localStorage.setItem("twitter_oauth_state", state);
        localStorage.setItem("twitter_oauth_timestamp", Date.now().toString());
        localStorage.setItem("twitter_oauth_return_path", window.location.pathname);
        const { authUrl } = await backendSparkApi.getTwitterOAuthUrl({
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        });
        window.location.href = authUrl;
      } else if (provider === "github") {
        sessionStorage.setItem("oauth_code_verifier", state);
        const { authUrl } = await backendSparkApi.getGitHubOAuthUrl({
          redirect_uri: redirectUri,
          state,
        });
        window.location.href = authUrl;
      } else if (provider === "google") {
        sessionStorage.setItem("oauth_code_verifier", state);
        const { authUrl } = await backendSparkApi.getGoogleOAuthUrl({
          redirect_uri: redirectUri,
          state,
        });
        window.location.href = authUrl;
      }
    } catch (err) {
      console.error("[Login] OAuth error:", err);
    }
  };

  const ecosystemNav = [
    { label: "Ideas", path: ROUTES.IDEAS },
    { label: "Funded", path: ROUTES.FUNDED },
    { label: "How it works", path: ROUTES.EXPLANATION },
    { label: "Hackathons", path: ROUTES.HACKATHONS },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-neutral-400 antialiased selection:bg-orange-500/20 selection:text-orange-200">
      <div className="pointer-events-none fixed inset-0 z-0 bg-black">
        <div className="h-full w-full origin-center -scale-y-100 opacity-[0.34]">
          <Aurora colorStops={AURORA_STOPS} amplitude={1} blend={0.5} />
        </div>
      </div>

      <header className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-black/75 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-6 md:px-10">
          <Link
            to={ROUTES.LANDING_PAGE}
            className="shrink-0 opacity-90 transition-opacity hover:opacity-100"
          >
            <img src="/sparklogo.png" alt="Spark" className="h-6 w-auto md:h-7" />
          </Link>

          <nav className="flex min-w-0 flex-1 justify-center gap-4 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-6 md:px-4 [&::-webkit-scrollbar]:hidden">
            {ecosystemNav.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`shrink-0 text-[11px] font-medium transition-colors md:text-[13px] font-geist ${
                  isActive(link.path) ? "text-orange-400" : "text-neutral-500 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center">
          {(isWalletConnected || isXConnected) ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="text-xs text-[#F25C05] border border-[#F25C05]/30 px-3 py-1.5 flex items-center gap-2 hover:bg-[#F25C05]/5 transition-all"
              >
                {isWalletConnected ? (
                  <><Wallet className="w-3.5 h-3.5" />{truncatedAddress}</>
                ) : (
                  <>𝕏 @{xProfile.xUsername}</>
                )}
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1 bg-[#0B0F19] border border-[#444B57] z-50 min-w-[180px]">
                  {menuSection === "main" ? (
                    <>
                      <Link
                        to="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors"
                      >
                        {">"} my profile
                      </Link>
                      {/* Connect wallet option when only X is connected */}
                      {!isWalletConnected && (
                        <>
                          <div className="border-t border-[#2A3040]" />
                          <button
                            onClick={() => setMenuSection("wallet")}
                            className="w-full text-left px-4 py-2.5 text-xs text-[#F25C05] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors flex items-center gap-2"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            {">"} connect wallet
                          </button>
                        </>
                      )}
                      <div className="border-t border-[#2A3040]" />
                      <button
                        onClick={() => {
                          signOut();
                          localStorage.removeItem("spark_user_profile");
                          setXProfile(null);
                          setMenuOpen(false);
                          setMenuSection("main");
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#FF0000] hover:bg-[#131822] transition-colors"
                      >
                        {">"} disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setMenuSection("main")}
                        className="w-full text-left px-4 py-2 text-[10px] text-[#A0A3A9] hover:text-[#B0B3B8] transition-colors"
                      >
                        {"<"} back
                      </button>
                      <div className="border-t border-[#2A3040]" />
                      {wallets.map((w) => (
                        <button
                          key={w.name}
                          onClick={() => {
                            w.connect();
                            setMenuOpen(false);
                            setMenuSection("main");
                          }}
                          className="w-full text-left px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors"
                        >
                          {">"} {w.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="relative" ref={loginRef}>
              <button
                onClick={() => { setLoginOpen((v) => !v); setLoginSection("main"); }}
                className="text-xs text-[#F5F5F6] border border-[#444B57] px-3 py-1.5 hover:border-[#F25C05]/50 hover:bg-[#131822] transition-all flex items-center gap-2"
              >
                <LogIn className="w-3.5 h-3.5" />
                login
              </button>

              {loginOpen && (
                <div className="absolute right-0 mt-1 bg-[#0B0F19] border border-[#444B57] z-50 min-w-[200px]">
                  {loginSection === "main" ? (
                    <>
                      {/* Wallet sub-menu */}
                      <button
                        onClick={() => setLoginSection("wallet")}
                        className="w-full text-left px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors flex items-center gap-2"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        {">"} wallet
                      </button>
                      <div className="border-t border-[#2A3040]" />
                      {/* Google */}
                      <button
                        onClick={() => startSocialLogin("google")}
                        className="w-full text-left px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors flex items-center gap-2"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                        {">"} Google
                      </button>
                      {/* GitHub */}
                      <button
                        onClick={() => startSocialLogin("github")}
                        className="w-full text-left px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors flex items-center gap-2"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                        {">"} GitHub
                      </button>
                      {/* X / Twitter */}
                      <button
                        onClick={() => startSocialLogin("twitter")}
                        className="w-full text-left px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors flex items-center gap-2"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        {">"} X
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Back button */}
                      <button
                        onClick={() => setLoginSection("main")}
                        className="w-full text-left px-4 py-2 text-[10px] text-[#A0A3A9] hover:text-[#B0B3B8] transition-colors"
                      >
                        {"<"} back
                      </button>
                      <div className="border-t border-[#2A3040]" />
                      {/* Wallet list */}
                      {wallets.map((w) => (
                        <button
                          key={w.name}
                          onClick={() => {
                            w.connect();
                            setLoginOpen(false);
                            setLoginSection("main");
                          }}
                          className="w-full text-left px-4 py-2.5 text-xs text-[#B0B3B8] hover:text-[#F5F5F6] hover:bg-[#131822] transition-colors"
                        >
                          {">"} {w.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </header>

      <main className="relative z-10 min-w-0 flex-1 overflow-x-hidden pt-14">{children}</main>

      <footer className="relative z-10 mt-auto border-t border-white/[0.06] bg-black/50 py-10 backdrop-blur-[1px]">
        <div className="mx-auto flex max-w-3xl flex-col justify-between gap-6 px-6 text-[12px] text-neutral-500 md:flex-row md:items-start md:px-10 font-geist">
          <div>
            <p className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-orange-400/90">Spark</p>
            <p className="mt-2 text-neutral-600">&copy; 2026</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end">
            <a
              href="https://x.com/JustSparkIdeas"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
            >
              X
            </a>
            <a
              href="https://t.me/sparkdotfun"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
            >
              Telegram
            </a>
            <Link to={ROUTES.TERMS} className="transition-colors hover:text-white">
              Terms
            </Link>
            <Link to={ROUTES.PRIVACY} className="transition-colors hover:text-white">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
