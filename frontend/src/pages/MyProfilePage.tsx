import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import HackathonLayout from "@/components/Hackathon/HackathonLayout";
import { AsciiBox } from "@/components/Hackathon/AsciiBox";
import { useWalletContext } from "@/hooks/useWalletContext";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import { generateCodeVerifier, generateCodeChallenge } from "@/components/Ideas/utils";

const REFERRAL_TOKEN_PERCENT = 0.005; // 0.5% reward

/* ── reusable multi-select tag picker ─────────────────────────── */

interface TagSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function TagSelect({ label, options, selected, onChange }: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const remaining = options.filter((o) => !selected.includes(o));

  return (
    <div className="mb-4">
      <label className="text-[10px] text-[#85888E] uppercase tracking-widest block mb-1.5">
        {label}
      </label>
      <div className="flex flex-wrap items-center">
        {selected.map((tag) => (
          <span
            key={tag}
            className="text-[10px] text-[#F25C05] border border-[#F25C05]/30 bg-[#F25C05]/5 px-1.5 py-0.5 inline-flex items-center gap-1 mr-1 mb-1"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(selected.filter((t) => t !== tag))}
              className="hover:text-[#F5F5F6] transition-colors"
            >
              ✕
            </button>
          </span>
        ))}

        {remaining.length > 0 && (
          <div ref={ref} className="relative inline-block mb-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[10px] text-[#85888E] border border-[#333741] px-1.5 py-0.5 hover:border-[#9C9C9D] cursor-pointer transition-colors"
            >
              [+ add]
            </button>

            {open && (
              <div className="absolute bg-[#0B0F19] border border-[#333741] max-h-40 overflow-y-auto z-10 mt-1 min-w-[160px]">
                {remaining.map((opt) => (
                  <div
                    key={opt}
                    onClick={() => {
                      onChange([...selected, opt]);
                      setOpen(false);
                    }}
                    className="px-3 py-1.5 text-[10px] text-[#9C9C9D] hover:text-[#F5F5F6] hover:bg-[#131822] cursor-pointer"
                  >
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SVG icons ───────────────────────────────────────────────── */

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/* ── constants ────────────────────────────────────────────────── */

const ROLE_OPTIONS = [
  "Software Engineer",
  "Backend Dev",
  "Frontend Dev",
  "Protocol Engineer",
  "AI/ML",
  "Designer",
  "Product Manager",
  "Researcher",
];

const SKILL_OPTIONS = [
  "Rust",
  "Anchor",
  "TypeScript",
  "React",
  "React Native",
  "Python",
  "Solidity",
  "Go",
  "Move",
  "Cairo",
  "C++",
  "JavaScript",
  "Node.js",
  "GraphQL",
  "Smart Contracts",
];

const INTEREST_OPTIONS = [
  "DeFi",
  "DePIN",
  "Consumer",
  "Security Tools",
  "Dev Infra",
  "Social",
  "DAOs",
  "Gaming",
  "NFTs",
  "Payments",
  "Data",
  "AI",
];

const LANGUAGE_OPTIONS = [
  "English",
  "French",
  "Spanish",
  "Mandarin",
  "Hindi",
  "German",
  "Japanese",
  "Korean",
  "Portuguese",
  "Russian",
];

/* ── input class ──────────────────────────────────────────────── */

const INPUT_CLASS =
  "bg-transparent border border-[#333741] px-3 py-2 text-xs text-[#F5F5F6] focus:border-[#F25C05] outline-none transition-colors font-mono w-full placeholder:text-[#85888E]";

/* ── page ─────────────────────────────────────────────────────── */

export default function MyProfilePage() {
  const { address, isWalletConnected, connectWithPhantom } = useWalletContext();
  const queryClient = useQueryClient();

  // text fields
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("");
  const [city, setCity] = useState("");
  const [about, setAbout] = useState("");

  // multi-select tags
  const [roles, setRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  // toggle
  const [student, setStudent] = useState(false);

  // more text
  const [lookingForTeammates, setLookingForTeammates] = useState("");
  const [twitter, setTwitter] = useState("");
  const [github, setGithub] = useState("");
  const [telegram, setTelegram] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");

  // form state
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // OAuth
  const [oauthLoading, setOauthLoading] = useState(false);
  const [colosseumProposal, setColosseumProposal] = useState<Record<string, unknown> | null>(null);
  const [addWalletProposal, setAddWalletProposal] = useState<Record<string, unknown> | null>(null);

  // Load existing builder profile by wallet
  const { data: existingBuilder, isLoading } = useQuery({
    queryFn: () => backendSparkApi.getBuilderByWallet(address),
    queryKey: ["builder-by-wallet", address],
    enabled: isWalletConnected && !!address,
    refetchOnWindowFocus: false,
  });

  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string" && v) return v.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  };

  const populateFromBuilder = (b: Record<string, unknown>) => {
    setUsername((b.username as string) || "");
    setDisplayName((b.display_name as string) || "");
    setPosition((b.position as string) || "");
    setCity((b.city as string) || "");
    setAbout((b.about as string) || "");
    setRoles(toArray(b.i_am_a));
    setSkills(toArray(b.skills));
    setInterests(toArray(b.interested_in));
    setLookingFor(toArray(b.looking_for));
    setLanguages(toArray(b.languages));
    setStudent(!!b.is_student);
    setLookingForTeammates((b.looking_for_teammates_text as string) || "");
    setTwitter((b.twitter_url as string) || "");
    setGithub((b.github_url as string) || "");
    setTelegram((b.telegram_url as string) || "");
    setGoogleEmail((b.google_email as string) || "");
  };

  // Populate form when wallet builder loads
  useEffect(() => {
    if (loaded || !existingBuilder?.builder) return;
    populateFromBuilder(existingBuilder.builder as Record<string, unknown>);
    setLoaded(true);
  }, [existingBuilder, loaded]);

  // Handle OAuth callback — code & state in URL params (same pattern as ClaimFees)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) return;

    console.log("[OAuth] Callback detected in URL", { code: code.slice(0, 10) + "...", state });

    const provider = sessionStorage.getItem("oauth_provider");
    const codeVerifier = sessionStorage.getItem("oauth_code_verifier");
    const storedState = sessionStorage.getItem("oauth_state");
    const mode = sessionStorage.getItem("oauth_mode") || "search";
    const claimBuilderUsername = sessionStorage.getItem("oauth_claim_builder");

    console.log("[OAuth] Session data:", { provider, hasCodeVerifier: !!codeVerifier, storedState, mode, claimBuilderUsername });

    if (state !== storedState || !codeVerifier) {
      console.warn("[OAuth] State mismatch or missing codeVerifier", { stateMatch: state === storedState, hasCodeVerifier: !!codeVerifier });
      return;
    }

    // Clean URL
    window.history.replaceState({}, document.title, "/profile");

    const redirectUri = `${window.location.origin}/profile`;

    function extractUsernameFromUrl(url: string): string {
      try {
        const u = new URL(url);
        return u.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
      } catch {
        return url.replace(/^@/, "").toLowerCase();
      }
    }

    async function handleCallback() {
      try {
        console.log("[OAuth] handleCallback start", { provider, mode, code: code?.slice(0, 10) + "..." });
        let verifiedUsername = "";

        if (provider === "twitter") {
          console.log("[OAuth] Exchanging Twitter token...");
          const result = await backendSparkApi.exchangeTwitterOAuthToken({
            code: code!, redirect_uri: redirectUri, code_verifier: codeVerifier!,
          });
          verifiedUsername = result.user.username.toLowerCase();
          console.log("[OAuth] Twitter verified:", verifiedUsername);
        } else if (provider === "github") {
          console.log("[OAuth] Exchanging GitHub token...", { redirectUri });
          const result = await backendSparkApi.exchangeGitHubOAuthToken({
            code: code!, redirect_uri: redirectUri,
          });
          console.log("[OAuth] GitHub token exchange result:", result);
          verifiedUsername = result.user.login.toLowerCase();
          console.log("[OAuth] GitHub verified:", verifiedUsername);
        } else if (provider === "google") {
          console.log("[OAuth] Exchanging Google token...", { redirectUri });
          const result = await backendSparkApi.exchangeGoogleOAuthToken({
            code: code!, redirect_uri: redirectUri,
          });
          console.log("[OAuth] Google token exchange result:", result);
          verifiedUsername = result.user.email.toLowerCase();
          console.log("[OAuth] Google verified:", verifiedUsername);
        }

        // Clean up session
        sessionStorage.removeItem("oauth_provider");
        sessionStorage.removeItem("oauth_code_verifier");
        sessionStorage.removeItem("oauth_state");
        sessionStorage.removeItem("oauth_mode");
        sessionStorage.removeItem("oauth_claim_builder");

        if (!verifiedUsername) {
          console.warn("[OAuth] No verified username, aborting");
          return;
        }

        const socialUrl = provider === "twitter"
          ? `https://x.com/${verifiedUsername}`
          : provider === "github"
          ? `https://github.com/${verifiedUsername}`
          : verifiedUsername; // google: email as identifier
        console.log("[OAuth] Social URL:", socialUrl);

        if (mode === "claim" && claimBuilderUsername && address) {
          console.log("[OAuth] Claim mode for builder:", claimBuilderUsername);
          const builderData = await backendSparkApi.getBuilderByUsername(claimBuilderUsername);
          const builder = builderData?.builder as Record<string, unknown> | null;
          if (!builder) {
            console.warn("[OAuth] Builder not found:", claimBuilderUsername);
            return;
          }

          const builderSocial = provider === "twitter" ? builder.twitter_url : builder.github_url;
          const expectedUsername = extractUsernameFromUrl(builderSocial as string || "");
          console.log("[OAuth] Claim: verified =", verifiedUsername, "expected =", expectedUsername);

          if (verifiedUsername === expectedUsername) {
            console.log("[OAuth] Username match — claiming profile");
            await backendSparkApi.updateBuilderProfile(address, {
              username: builder.username, display_name: builder.display_name,
              position: builder.position, city: builder.city, about: builder.about,
              i_am_a: builder.i_am_a, skills: builder.skills,
              interested_in: builder.interested_in, looking_for: builder.looking_for,
              languages: builder.languages, is_student: builder.is_student,
              looking_for_teammates_text: builder.looking_for_teammates_text,
              twitter_url: builder.twitter_url, github_url: builder.github_url,
              telegram_url: builder.telegram_url,
            });
            populateFromBuilder(builder);
            setLoaded(true);
            console.log("[OAuth] Profile claimed successfully");
          } else {
            console.warn("[OAuth] Username mismatch, claim denied");
          }
        } else {
          // Search/login flow: fill social URL, check if builder exists in DB
          console.log("[OAuth] Search/login mode — filling social URL");
          if (provider === "twitter") setTwitter(socialUrl);
          else if (provider === "github") setGithub(socialUrl);
          else if (provider === "google") setGoogleEmail(socialUrl); // socialUrl = email for google

          console.log("[OAuth] Searching for builder by social:", socialUrl);
          const { builder } = await backendSparkApi.findBuilderBySocial(socialUrl);
          console.log("[OAuth] findBuilderBySocial result:", builder);

          if (builder) {
            const builderRecord = builder as unknown as Record<string, unknown>;
            const builderWallet = builderRecord.wallet_address as string;
            const additionalWallets = (builderRecord.additional_wallets as string[]) || [];
            const allWallets = [builderWallet, ...additionalWallets].filter(Boolean);
            console.log("[OAuth] Builder found:", {
              username: builderRecord.username,
              claimed: builderRecord.claimed,
              wallet: builderWallet,
              additionalWallets,
              currentWallet: address,
              walletMatch: allWallets.includes(address),
            });

            if (allWallets.includes(address)) {
              console.log("[OAuth] Already linked to this wallet — populating form");
              populateFromBuilder(builderRecord);
              setLoaded(true);
            } else if (builderRecord.claimed) {
              console.log("[OAuth] Claimed by different wallet — proposing add_wallet");
              setAddWalletProposal(builderRecord);
            } else {
              console.log("[OAuth] Unclaimed profile — proposing Colosseum import");
              setColosseumProposal(builderRecord);
            }
          } else {
            console.log("[OAuth] No builder found for this social");
          }
        }
      } catch (err) {
        console.error("[OAuth] Callback error:", err);
      }
    }

    handleCallback();
  }, [address]);

  const acceptColosseumImport = () => {
    if (!colosseumProposal) return;
    populateFromBuilder(colosseumProposal);
    setLoaded(true);
    setColosseumProposal(null);
  };

  const acceptAddWallet = async () => {
    if (!addWalletProposal || !address) return;
    try {
      const builderId = addWalletProposal.id as string;
      await backendSparkApi.addWalletToBuilder(address, builderId);
      populateFromBuilder(addWalletProposal);
      setLoaded(true);
      setAddWalletProposal(null);
      queryClient.invalidateQueries({ queryKey: ["builder-by-wallet", address] });
    } catch (err) {
      console.error("Failed to add wallet:", err);
    }
  };

  const startOAuthConnect = async (provider: string) => {
    console.log("[OAuth] startOAuthConnect:", provider);
    setOauthLoading(true);
    const redirectUri = `${window.location.origin}/profile`;
    const state = Math.random().toString(36).substring(2, 15);

    sessionStorage.setItem("oauth_provider", provider);
    sessionStorage.setItem("oauth_state", state);
    console.log("[OAuth] State stored:", { provider, state, redirectUri });

    try {
      if (provider === "twitter") {
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        sessionStorage.setItem("oauth_code_verifier", codeVerifier);
        console.log("[OAuth] Twitter PKCE generated, requesting auth URL...");
        const { authUrl } = await backendSparkApi.getTwitterOAuthUrl({
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        });
        console.log("[OAuth] Twitter auth URL received, redirecting...");
        window.location.href = authUrl;
      } else if (provider === "github") {
        sessionStorage.setItem("oauth_code_verifier", state); // GitHub doesn't use PKCE
        console.log("[OAuth] Requesting GitHub auth URL...");
        const { authUrl } = await backendSparkApi.getGitHubOAuthUrl({
          redirect_uri: redirectUri,
          state,
        });
        console.log("[OAuth] GitHub auth URL received:", authUrl);
        console.log("[OAuth] Redirecting to GitHub...");
        window.location.href = authUrl;
      } else if (provider === "google") {
        sessionStorage.setItem("oauth_code_verifier", state);
        console.log("[OAuth] Requesting Google auth URL...");
        const { authUrl } = await backendSparkApi.getGoogleOAuthUrl({
          redirect_uri: redirectUri,
          state,
        });
        console.log("[OAuth] Google auth URL received, redirecting...");
        window.location.href = authUrl;
      }
    } catch (err) {
      console.error("[OAuth] startOAuthConnect error:", err);
      setOauthLoading(false);
    }
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      backendSparkApi.updateBuilderProfile(address, {
        username,
        display_name: displayName,
        position,
        city,
        about,
        i_am_a: roles,
        skills,
        interested_in: interests,
        looking_for: lookingFor,
        languages,
        is_student: student,
        looking_for_teammates_text: lookingForTeammates,
        twitter_url: twitter,
        github_url: github,
        telegram_url: telegram,
        google_email: googleEmail,
      }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["builder-by-wallet", address] });
    },
  });

  const handleSave = () => {
    setSubmitted(true);
    if (!username.trim()) return;
    saveMutation.mutate();
  };

  if (!isWalletConnected) {
    return (
      <HackathonLayout>
        <div className="max-w-2xl mx-auto px-6 pt-24 pb-16">
          <div className="border border-dashed border-[#2A3040] p-8 font-mono">
            {/* ASCII header */}
            <div className="text-[#F25C05] text-xs mb-6">
              <span>{"┌─── BUILDER PROFILE ────────────────────────────┐"}</span>
            </div>

            <div className="pl-4 space-y-3 mb-8">
              <p className="text-sm text-[#F5F5F6]">&gt; <span className="text-[#F25C05]">whoami</span></p>
              <p className="text-xs text-[#A0A3A9]">{"// connect your wallet to set up your builder profile"}</p>
              <div className="mt-4 space-y-1.5 text-[10px] text-[#555E6B]">
                <p>{"  ├── set skills, roles & interests"}</p>
                <p>{"  ├── get discovered by hackathon organizers"}</p>
                <p>{"  ├── link twitter, github & telegram"}</p>
                <p>{"  └── join 30,000+ indexed builders"}</p>
              </div>
            </div>

            <div className="text-[#F25C05] text-xs mb-6">
              <span>{"└────────────────────────────────────────────────┘"}</span>
            </div>

            <button
              onClick={connectWithPhantom}
              className="w-full text-xs font-mono text-[#F5F5F6] border border-[#F25C05]/40 bg-[#F25C05]/5 py-3 hover:bg-[#F25C05]/10 hover:border-[#F25C05]/70 transition-colors"
            >
              {">> [ CONNECT WALLET ] <<"}</button>
          </div>
        </div>
      </HackathonLayout>
    );
  }

  if (isLoading) {
    return (
      <HackathonLayout>
        <div className="max-w-2xl mx-auto px-6 pt-24 pb-16">
          <p className="text-xs text-[#9C9C9D] font-mono">loading...</p>
        </div>
      </HackathonLayout>
    );
  }

  return (
    <HackathonLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-2xl mx-auto px-6 pt-24 pb-16"
      >
        {/* Colosseum import proposal */}
        {colosseumProposal && (
          <div className="mb-6 border border-dashed border-[#F25C05]/30 bg-[#F25C05]/5 px-4 py-3">
            <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-2">
              {"// Colosseum profile found //"}
            </p>
            <p className="text-[10px] text-[#9C9C9D] mb-3">
              We found your profile on Colosseum as <span className="text-[#F5F5F6]">@{colosseumProposal.username as string}</span>. Import all your data?
            </p>
            <div className="flex gap-2">
              <button
                onClick={acceptColosseumImport}
                className="text-xs text-[#F5F5F6] border border-[#F25C05]/50 px-3 py-1.5 hover:bg-[#F25C05]/10 transition-all"
              >
                {">"} import profile
              </button>
              <button
                onClick={() => setColosseumProposal(null)}
                className="text-xs text-[#85888E] border border-[#333741] px-3 py-1.5 hover:text-[#9C9C9D] transition-all"
              >
                dismiss
              </button>
            </div>
          </div>
        )}

        {/* Add wallet proposal — profile exists with different wallet */}
        {addWalletProposal && (
          <div className="mb-6 border border-dashed border-[#75E0A7]/30 bg-[#75E0A7]/5 px-4 py-3">
            <p className="text-[10px] text-[#75E0A7] uppercase tracking-widest mb-2">
              {"// existing profile found //"}
            </p>
            <p className="text-[10px] text-[#9C9C9D] mb-3">
              Your account <span className="text-[#F5F5F6]">@{addWalletProposal.username as string}</span> is already linked to another wallet. Add this wallet to your profile?
            </p>
            <div className="flex gap-2">
              <button
                onClick={acceptAddWallet}
                className="text-xs text-[#F5F5F6] border border-[#75E0A7]/50 px-3 py-1.5 hover:bg-[#75E0A7]/10 transition-all"
              >
                {">"} add wallet
              </button>
              <button
                onClick={() => setAddWalletProposal(null)}
                className="text-xs text-[#85888E] border border-[#333741] px-3 py-1.5 hover:text-[#9C9C9D] transition-all"
              >
                dismiss
              </button>
            </div>
          </div>
        )}

        <AsciiBox title="EDIT PROFILE" titleColor="orange">
          {/* ── SOCIALS (top) ──────────────────────────────── */}
          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                X
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="https://x.com/..."
                  className={`${INPUT_CLASS} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => startOAuthConnect("twitter")}
                  disabled={oauthLoading}
                  className="shrink-0 w-9 h-9 border border-[#333741] bg-[#0B0F19] flex items-center justify-center text-[#9C9C9D] hover:border-[#F25C05]/50 hover:text-[#F5F5F6] hover:bg-[#131822] transition-all disabled:opacity-50"
                >
                  <XIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                GITHUB
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  placeholder="https://github.com/..."
                  className={`${INPUT_CLASS} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => startOAuthConnect("github")}
                  disabled={oauthLoading}
                  className="shrink-0 w-9 h-9 border border-[#333741] bg-[#0B0F19] flex items-center justify-center text-[#9C9C9D] hover:border-[#F25C05]/50 hover:text-[#F5F5F6] hover:bg-[#131822] transition-all disabled:opacity-50"
                >
                  <GitHubIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                TELEGRAM
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="https://t.me/..."
                  className={`${INPUT_CLASS} flex-1`}
                />
                <button
                  type="button"
                  disabled
                  title="Telegram OAuth coming soon"
                  className="shrink-0 w-9 h-9 border border-[#333741] bg-[#0B0F19] flex items-center justify-center text-[#9C9C9D] opacity-30 cursor-not-allowed"
                >
                  <TelegramIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                GOOGLE
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  value={googleEmail}
                  readOnly
                  placeholder="connect with Google"
                  className={`${INPUT_CLASS} flex-1 cursor-default`}
                />
                <button
                  type="button"
                  onClick={() => startOAuthConnect("google")}
                  disabled={oauthLoading}
                  className="shrink-0 w-9 h-9 border border-[#333741] bg-[#0B0F19] flex items-center justify-center text-[#9C9C9D] hover:border-[#F25C05]/50 hover:text-[#F5F5F6] hover:bg-[#131822] transition-all disabled:opacity-50"
                >
                  <GoogleIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="border-b border-dashed border-[#1F242F] my-4" />

          {/* USERNAME */}
          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                USERNAME*
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <div className="w-full">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={INPUT_CLASS}
                />
                {submitted && !username.trim() && (
                  <p className="text-[10px] text-[#FF0000] mt-1">
                    ERR: username required
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* DISPLAY NAME */}
          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                NAME
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* POSITION */}
          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                POSITION
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Software Engineer"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* CITY */}
          <div className="mb-4">
            <div className="flex items-start gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 pt-2 w-20">
                CITY
              </label>
              <span className="text-[#333741] text-xs pt-2 shrink-0">::</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="San Francisco"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* ABOUT */}
          <div className="mb-4">
            <label className="text-[10px] text-[#85888E] uppercase tracking-widest block mb-1.5">
              ABOUT
            </label>
            <textarea
              rows={3}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          {/* ── multi-select tag fields ──────────────────────── */}

          <TagSelect
            label="I AM A"
            options={ROLE_OPTIONS}
            selected={roles}
            onChange={setRoles}
          />

          <TagSelect
            label="SKILLS"
            options={SKILL_OPTIONS}
            selected={skills}
            onChange={setSkills}
          />

          <TagSelect
            label="INTERESTED IN"
            options={INTEREST_OPTIONS}
            selected={interests}
            onChange={setInterests}
          />

          <TagSelect
            label="LOOKING FOR"
            options={ROLE_OPTIONS}
            selected={lookingFor}
            onChange={setLookingFor}
          />

          <TagSelect
            label="LANGUAGES"
            options={LANGUAGE_OPTIONS}
            selected={languages}
            onChange={setLanguages}
          />

          {/* STUDENT */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-[#85888E] uppercase tracking-widest shrink-0 w-20">
                STUDENT
              </label>
              <span className="text-[#333741] text-xs shrink-0">::</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setStudent(true)}
                  className={
                    student
                      ? "bg-[#F25C05]/10 text-[#F25C05] border border-[#F25C05]/30 px-2 py-1 text-[10px]"
                      : "text-[#85888E] border border-[#333741] px-2 py-1 text-[10px] hover:border-[#9C9C9D] cursor-pointer"
                  }
                >
                  [YES]
                </button>
                <button
                  type="button"
                  onClick={() => setStudent(false)}
                  className={
                    !student
                      ? "bg-[#F25C05]/10 text-[#F25C05] border border-[#F25C05]/30 px-2 py-1 text-[10px]"
                      : "text-[#85888E] border border-[#333741] px-2 py-1 text-[10px] hover:border-[#9C9C9D] cursor-pointer"
                  }
                >
                  [NO]
                </button>
              </div>
            </div>
          </div>

          {/* LOOKING FOR TEAMMATES */}
          <div className="mb-4">
            <label className="text-[10px] text-[#85888E] uppercase tracking-widest block mb-1.5">
              LOOKING FOR TEAMMATES
            </label>
            <textarea
              rows={2}
              value={lookingForTeammates}
              onChange={(e) => setLookingForTeammates(e.target.value)}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>
        </AsciiBox>

        {/* SAVE BUTTON */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="shiny-button w-full py-3 text-sm rounded-none text-center mt-6 disabled:opacity-50"
        >
          {saveMutation.isPending ? ">> [ SAVING... ] <<" : ">> [ SAVE PROFILE ] <<"}
        </button>

        {/* SAVED FLASH */}
        {saved && (
          <p className="text-xs text-[#75E0A7] text-center mt-3">
            profile saved
          </p>
        )}

        {/* ERROR */}
        {saveMutation.isError && (
          <p className="text-xs text-[#FF0000] text-center mt-3">
            ERR: {saveMutation.error?.message || "failed to save"}
          </p>
        )}

        {/* ── REFERRALS SECTION (hidden) ──────────────────── */}
        {/* <ReferralSection wallet={address} /> */}
      </motion.div>
    </HackathonLayout>
  );
}

/* ── Referral Section Component ─────────────────────────────── */

function ReferralSection({ wallet }: { wallet: string }) {
  const [copied, setCopied] = useState(false);

  const { data: codeData } = useQuery({
    queryFn: () => backendSparkApi.getReferralCode(wallet),
    queryKey: ["referral-code", wallet],
    enabled: !!wallet,
  });

  const { data: referralsData, isLoading } = useQuery({
    queryFn: () => backendSparkApi.getReferralsWithInvestments(wallet),
    queryKey: ["referrals-with-investments", wallet],
    enabled: !!wallet,
  });

  const referralCode = codeData?.code || "";
  const referrals = referralsData?.referrals || [];
  const totalInvested = referrals.reduce((s, r) => s + r.total_invested_after_referral, 0);
  const totalReward = totalInvested * REFERRAL_TOKEN_PERCENT;
  const referralLink = referralCode ? `${window.location.origin}?ref=${referralCode}` : "";

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8">
      <AsciiBox title="REFERRALS" titleColor="orange">
        {/* Referral code + copy */}
        <div className="mb-4">
          <label className="text-[10px] text-[#85888E] uppercase tracking-widest block mb-1.5">
            YOUR REFERRAL LINK
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="bg-transparent border border-[#333741] px-3 py-2 text-xs text-[#9C9C9D] font-mono w-full cursor-default"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 text-xs border border-[#333741] px-3 py-2 text-[#9C9C9D] hover:border-[#F25C05]/50 hover:text-[#F5F5F6] transition-all font-mono"
            >
              {copied ? "[copied]" : "[copy]"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-4">
          <div className="border border-[#333741] px-4 py-3 flex-1">
            <p className="text-[10px] text-[#85888E] uppercase tracking-widest">Referrals</p>
            <p className="text-lg text-[#F5F5F6] font-mono">{referrals.length}</p>
          </div>
          <div className="border border-[#333741] px-4 py-3 flex-1">
            <p className="text-[10px] text-[#85888E] uppercase tracking-widest">Total Invested</p>
            <p className="text-lg text-[#F5F5F6] font-mono">${totalInvested.toFixed(2)}</p>
          </div>
          <div className="border border-[#333741] px-4 py-3 flex-1">
            <p className="text-[10px] text-[#85888E] uppercase tracking-widest">Reward (0.5%)</p>
            <p className="text-lg text-[#75E0A7] font-mono">${totalReward.toFixed(2)}</p>
          </div>
        </div>

        {/* Referrals table */}
        {isLoading ? (
          <p className="text-xs text-[#9C9C9D] font-mono py-4">loading referrals...</p>
        ) : referrals.length === 0 ? (
          <p className="text-xs text-[#85888E] font-mono py-4 text-center">
            {"// no referrals yet — share your link to earn 0.5% of their investments as tokens //"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-[10px] text-[#85888E] uppercase tracking-widest border-b border-[#333741]">
                  <th className="text-left py-2 px-2">Wallet</th>
                  <th className="text-left py-2 px-2">User</th>
                  <th className="text-right py-2 px-2">Invested</th>
                  <th className="text-right py-2 px-2">Your Reward</th>
                  <th className="text-right py-2 px-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => {
                  const reward = r.total_invested_after_referral * REFERRAL_TOKEN_PERCENT;
                  return (
                    <tr key={r.id} className="border-b border-[#1F242F] hover:bg-[#131822]">
                      <td className="py-2 px-2 text-[#9C9C9D]">
                        {r.referee_wallet.slice(0, 4)}...{r.referee_wallet.slice(-4)}
                      </td>
                      <td className="py-2 px-2 text-[#9C9C9D]">
                        {r.referee_twitter_username ? `@${r.referee_twitter_username}` : "—"}
                      </td>
                      <td className="py-2 px-2 text-right text-[#F5F5F6]">
                        ${r.total_invested_after_referral.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-[#75E0A7]">
                        ${reward.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-[#85888E]">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-[#85888E] mt-3 font-mono">
          {"// rewards are airdropped as tokens when the idea launches //"}
        </p>
      </AsciiBox>
    </div>
  );
}
