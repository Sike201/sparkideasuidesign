import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import HackathonLayout from "@/components/Hackathon/HackathonLayout";
import { AsciiBox } from "@/components/Hackathon/AsciiBox";
import {
  getMockBuilder,
  getMockBuilderProposals,
} from "@/components/Hackathon/mockData";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import { withSwrCache } from "@/utils/miniCache";
import { useWalletContext } from "@/hooks/useWalletContext";
import { generateCodeVerifier, generateCodeChallenge } from "@/components/Ideas/utils";

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function TagList({ items }: { items: string[] | string }) {
  const arr = toArray(items);
  return (
    <span className="flex flex-wrap gap-1">
      {arr.map((item) => (
        <span
          key={item}
          className="text-[10px] text-[#F25C05] px-1.5 py-0.5 border border-[#F25C05]/30 bg-[#F25C05]/5"
        >
          [{item}]
        </span>
      ))}
    </span>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 mb-2">
      <span className="text-[10px] text-[#85888E] uppercase tracking-widest w-28 flex-shrink-0">
        {label}
      </span>
      <span className="text-[10px] text-[#85888E]">::</span>
      {children}
    </div>
  );
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function BuilderProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { isWalletConnected } = useWalletContext();

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["builder", username],
    ...withSwrCache(
      () => backendSparkApi.getBuilderByUsername(username!),
      `desktop_cache_builder_${username ?? "anon"}`,
      5 * 60_000,
    ),
    enabled: !!username,
    refetchOnWindowFocus: false,
  });

  const builder = apiData?.builder
    ? apiData.builder as any
    : (username ? getMockBuilder(username) : undefined);
  const proposals = apiData?.proposals
    ? apiData.proposals as any[]
    : (username ? getMockBuilderProposals(username) : []);

  const [oauthLoading, setOauthLoading] = useState(false);

  const startOAuthClaim = async (provider: string) => {
    if (!builder || !username) return;
    setOauthLoading(true);
    // Redirect to /profile which handles the OAuth callback
    const redirectUri = `${window.location.origin}/profile`;
    const state = Math.random().toString(36).substring(2, 15);

    // Store claim context so /profile can complete the claim after OAuth
    sessionStorage.setItem("oauth_provider", provider);
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem("oauth_mode", "claim");
    sessionStorage.setItem("oauth_claim_builder", username);

    try {
      if (provider === "twitter") {
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        sessionStorage.setItem("oauth_code_verifier", codeVerifier);
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
      }
    } catch {
      setOauthLoading(false);
    }
  };


  if (isLoading) {
    return (
      <HackathonLayout>
        <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 font-mono">
          <p className="text-xs text-[#9C9C9D]">loading...</p>
        </div>
      </HackathonLayout>
    );
  }

  if (!builder) {
    return (
      <HackathonLayout>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center py-32"
        >
          <p className="text-[#85888E] font-mono text-xs mb-4">
            {"// builder not found //"}
          </p>
          <Link
            to="/builders"
            className="text-[#F25C05] font-mono text-xs hover:underline"
          >
            {">"} back to builders
          </Link>
        </motion.div>
      </HackathonLayout>
    );
  }

  const initials = builder.display_name.slice(0, 2).toUpperCase();

  return (
    <HackathonLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-3xl mx-auto px-6 pt-24 pb-16"
      >
        {/* Back link */}
        <Link
          to="/builders"
          className="text-xs text-[#9C9C9D] hover:text-[#F25C05] mb-6 block font-mono"
        >
          {">"} cd ../builders
        </Link>

        {/* Builder Card */}
        <AsciiBox title="BUILDER">
          {/* Avatar + identity */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 border border-[#333741] bg-[#121621] flex items-center justify-center text-xs text-[#85888E] flex-shrink-0 overflow-hidden">
              {builder.avatar_url ? (
                <img
                  src={builder.avatar_url}
                  alt={builder.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-[#F5F5F6]">
                @{builder.username}
              </p>
              <p className="text-xs text-[#9C9C9D]">
                {builder.display_name}
              </p>
              {builder.position && (
                <p className="text-xs text-[#9C9C9D]">{builder.position}</p>
              )}
              {builder.city && (
                <p className="text-xs text-[#85888E]">{builder.city}</p>
              )}
            </div>
          </div>

          {/* Colosseum badge + claim */}
          {!builder.claimed && builder.source === "colosseum" && (
            <div className="mt-4 border border-dashed border-[#F25C05]/30 bg-[#F25C05]/5 px-3 py-3 relative">
              <p className="text-[10px] text-[#F25C05]">
                {"// already on Colosseum? Link your profile //"}
              </p>
              {isWalletConnected && (
                <>
                  <p className="text-[10px] text-[#9C9C9D] mt-2">
                    Select X, GitHub or Telegram to prove this is your profile:
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    {/* X (Twitter) — only if builder has twitter_url */}
                    {builder.twitter_url && (
                      <button
                        onClick={() => startOAuthClaim("twitter")}
                        disabled={oauthLoading}
                        className="w-10 h-10 border border-[#333741] bg-[#0B0F19] flex items-center justify-center hover:border-[#F25C05]/50 hover:bg-[#131822] transition-all disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#9C9C9D]">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </button>
                    )}
                    {/* GitHub — only if builder has github_url */}
                    {builder.github_url && (
                      <button
                        onClick={() => startOAuthClaim("github")}
                        disabled={oauthLoading}
                        className="w-10 h-10 border border-[#333741] bg-[#0B0F19] flex items-center justify-center hover:border-[#F25C05]/50 hover:bg-[#131822] transition-all disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-[#9C9C9D]">
                          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                      </button>
                    )}
                    {/* Telegram — only if builder has telegram_url */}
                    {builder.telegram_url && (
                      <button
                        disabled
                        title="Telegram verification coming soon"
                        className="w-10 h-10 border border-[#333741] bg-[#0B0F19] flex items-center justify-center opacity-30 cursor-not-allowed relative"
                      >
                        <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-[#9C9C9D]">
                          <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                        </svg>
                        <span className="absolute -bottom-0.5 -right-0.5 text-[6px] text-[#85888E] bg-[#0B0F19] px-0.5">soon</span>
                      </button>
                    )}
                    {/* No socials at all */}
                    {!builder.twitter_url && !builder.github_url && !builder.telegram_url && (
                      <p className="text-[10px] text-[#85888E]">
                        {"// no social accounts linked on this profile //"}
                      </p>
                    )}
                  </div>
                  {oauthLoading && (
                    <p className="text-[10px] text-[#9C9C9D] mt-2">redirecting...</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* About */}
          {builder.about && (
            <div className="mt-4">
              <p className="text-xs text-[#9C9C9D] leading-relaxed">
                {builder.about}
              </p>
            </div>
          )}

          {/* Divider */}
          <div className="border-b border-dashed border-[#1F242F] my-4" />

          {/* Structured fields */}
          <div className="font-mono">
            {toArray(builder.i_am_a).length > 0 && (
              <FieldRow label="I AM A">
                <span className="text-xs text-[#9C9C9D]">
                  {toArray(builder.i_am_a).join(", ")}
                </span>
              </FieldRow>
            )}

            {toArray(builder.skills).length > 0 && (
              <FieldRow label="SKILLS">
                <TagList items={builder.skills} />
              </FieldRow>
            )}

            {toArray(builder.interested_in).length > 0 && (
              <FieldRow label="INTERESTED">
                <TagList items={builder.interested_in} />
              </FieldRow>
            )}

            {toArray(builder.looking_for).length > 0 && (
              <FieldRow label="LOOKING FOR">
                <TagList items={builder.looking_for} />
              </FieldRow>
            )}

            {toArray(builder.languages).length > 0 && (
              <FieldRow label="LANGUAGES">
                <span className="text-xs text-[#9C9C9D]">
                  {toArray(builder.languages).join(", ")}
                </span>
              </FieldRow>
            )}

            <FieldRow label="STUDENT">
              <span className="text-xs text-[#9C9C9D]">
                {builder.is_student ? "Yes" : "No"}
              </span>
            </FieldRow>
          </div>

          {/* Looking for teammates */}
          {builder.looking_for_teammates_text && (
            <>
              <div className="border-b border-dashed border-[#1F242F] my-4" />
              <div>
                <p className="text-[10px] text-[#85888E] uppercase tracking-widest mb-1">
                  LOOKING FOR TEAMMATES:
                </p>
                <p className="text-xs text-[#9C9C9D] italic">
                  &ldquo;{builder.looking_for_teammates_text}&rdquo;
                </p>
              </div>
            </>
          )}

          {/* Links */}
          {(builder.twitter_url ||
            builder.github_url ||
            builder.telegram_url ||
            builder.wallet_address) && (
            <>
              <div className="border-b border-dashed border-[#1F242F] my-4" />
              <div>
                <p className="text-[10px] text-[#85888E] uppercase tracking-widest mb-2">
                  LINKS:
                </p>
                <div className="space-y-1">
                  {builder.twitter_url && (
                    <p className="text-xs">
                      <span className="text-[#9C9C9D]">&lt;x&gt;</span>{" "}
                      <a
                        href={builder.twitter_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#9C9C9D] hover:text-[#F5F5F6] transition-colors"
                      >
                        {extractDomain(builder.twitter_url)}
                      </a>
                    </p>
                  )}
                  {builder.github_url && (
                    <p className="text-xs">
                      <span className="text-[#9C9C9D]">&lt;gh&gt;</span>{" "}
                      <a
                        href={builder.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#9C9C9D] hover:text-[#F5F5F6] transition-colors"
                      >
                        {extractDomain(builder.github_url)}
                      </a>
                    </p>
                  )}
                  {builder.telegram_url && (
                    <p className="text-xs">
                      <span className="text-[#9C9C9D]">&lt;tg&gt;</span>{" "}
                      <a
                        href={builder.telegram_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#9C9C9D] hover:text-[#F5F5F6] transition-colors"
                      >
                        {extractDomain(builder.telegram_url)}
                      </a>
                    </p>
                  )}
                  {builder.wallet_address && (
                    <p className="text-xs font-mono">
                      <span className="text-[10px] text-[#85888E] uppercase tracking-widest">
                        WALLET
                      </span>{" "}
                      <span className="text-[#85888E]">::</span>{" "}
                      <span className="text-[#75E0A7]">
                        {truncateAddress(builder.wallet_address)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </AsciiBox>

        {/* Proposals Section */}
        <div className="mt-6">
          <AsciiBox title="PROPOSALS">
            {proposals.length === 0 ? (
              <p className="text-xs text-[#85888E] text-center py-4">
                {"// no proposals yet //"}
              </p>
            ) : (
              <div>
                {proposals.map((proposal: any) => {
                  const hackathonId = proposal.hackathon?.id || proposal.hackathon_id;
                  const title = proposal.hackathon?.idea_title || proposal.hackathon_title || proposal.title;
                  return (
                    <Link
                      key={proposal.id}
                      to={`/hackathons/${hackathonId}`}
                      className="py-2 border-b border-dashed border-[#1F242F] last:border-0 flex items-center gap-4 hover:bg-[#0D1117] transition-colors block"
                    >
                      <span className="text-xs text-[#F5F5F6]">
                        {title}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </AsciiBox>
        </div>
      </motion.div>
    </HackathonLayout>
  );
}
