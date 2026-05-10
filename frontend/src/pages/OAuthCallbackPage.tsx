import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import { useWalletContext } from "@/hooks/useWalletContext";

function extractUsernameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0]?.toLowerCase() || "";
  } catch {
    return url.replace(/^@/, "").toLowerCase();
  }
}

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { address } = useWalletContext();
  const [status, setStatus] = useState("verifying...");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    // Mobile-debug aid — log the raw URL we landed on so you can see
    // what Twitter sent back when remote-debugging from a phone. If
    // `code`/`state` are null here, Twitter redirected with an error
    // instead of a success (scope mismatch, user denied, etc.).
    console.log("[oauth-callback] landed with url=", window.location.href);
    console.log("[oauth-callback] code=", code, "state=", state);
    if (searchParams.get("error")) {
      console.error("[oauth-callback] twitter returned error=", searchParams.get("error"), "desc=", searchParams.get("error_description"));
      setError(`twitter: ${searchParams.get("error")} — ${searchParams.get("error_description") || ""}`);
      return;
    }

    if (!code || !state) {
      setError("missing code or state");
      return;
    }

    // state format: "provider:mode:extra"
    // mode = "claim" (from builder page) or "search" (from profile page)
    const parts = state.split(":");
    if (parts.length < 2) {
      setError("invalid state format");
      return;
    }

    const provider = parts[0];
    const mode = parts[1];
    const extra = parts.slice(2).join(":"); // builderUsername for claim mode
    // Must match the redirect_uri used during authorize (the registered callback URL)
    const redirectUri = localStorage.getItem("oauth_redirect_uri") || `${window.location.origin}/oauth-callback`;

    async function verifyOAuth(): Promise<string> {
      if (provider === "twitter") {
        const codeVerifier =
          localStorage.getItem("oauth_code_verifier") || "";
        setStatus("exchanging twitter token...");
        // Desktop-only flow now — the mini-app uses the tweet-proof flow
        // and never reaches this page.
        const result = await backendSparkApi.exchangeTwitterOAuthToken({
          code: code!,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        });
        return result.user.username.toLowerCase();
      } else if (provider === "github") {
        setStatus("exchanging github token...");
        const result = await backendSparkApi.exchangeGitHubOAuthToken({
          code: code!,
          redirect_uri: redirectUri,
        });
        return result.user.login.toLowerCase();
      }
      throw new Error(`unsupported provider: ${provider}`);
    }

    async function handleClaim(verifiedUsername: string) {
      const builderUsername = extra;
      setStatus("verifying identity...");
      const builderData =
        await backendSparkApi.getBuilderByUsername(builderUsername);
      const builder = builderData?.builder as Record<string, unknown> | null;

      if (!builder) {
        setError("builder profile not found");
        return;
      }

      let expectedUsername = "";
      if (provider === "twitter" && builder.twitter_url) {
        expectedUsername = extractUsernameFromUrl(
          builder.twitter_url as string,
        );
      } else if (provider === "github" && builder.github_url) {
        expectedUsername = extractUsernameFromUrl(
          builder.github_url as string,
        );
      }

      if (!expectedUsername) {
        setError(`no ${provider} link on this profile`);
        return;
      }

      if (verifiedUsername !== expectedUsername) {
        setError(
          `username mismatch: verified @${verifiedUsername} but profile has @${expectedUsername}`,
        );
        return;
      }

      if (!address) {
        setError("wallet not connected");
        return;
      }

      setStatus("claiming profile...");
      await backendSparkApi.updateBuilderProfile(address, {
        username: builder.username,
        display_name: builder.display_name,
        position: builder.position,
        city: builder.city,
        about: builder.about,
        i_am_a: builder.i_am_a,
        skills: builder.skills,
        interested_in: builder.interested_in,
        looking_for: builder.looking_for,
        languages: builder.languages,
        is_student: builder.is_student,
        looking_for_teammates_text: builder.looking_for_teammates_text,
        twitter_url: builder.twitter_url,
        github_url: builder.github_url,
        telegram_url: builder.telegram_url,
      });

      setStatus("profile claimed!");
      setTimeout(() => navigate("/profile"), 1500);
    }

    async function handleSearch(verifiedUsername: string) {
      setStatus("searching for your profile...");
      const socialUrl =
        provider === "twitter"
          ? `https://x.com/${verifiedUsername}`
          : `https://github.com/${verifiedUsername}`;

      const { builder } = await backendSparkApi.searchBuilderBySocial(socialUrl);

      if (builder) {
        localStorage.setItem(
          "oauth_result",
          JSON.stringify({ type: "found", provider, socialUrl, builder }),
        );
        setStatus("profile found! redirecting...");
      } else {
        localStorage.setItem(
          "oauth_result",
          JSON.stringify({ type: "not_found", provider, socialUrl, username: verifiedUsername }),
        );
        setStatus("redirecting...");
      }

      setTimeout(() => navigate("/profile"), 1000);
    }

    async function processOAuth() {
      try {
        const verifiedUsername = await verifyOAuth();
        localStorage.removeItem("oauth_code_verifier");
        localStorage.removeItem("oauth_redirect_uri");

        if (mode === "claim") {
          await handleClaim(verifiedUsername);
        } else if (mode === "search") {
          await handleSearch(verifiedUsername);
        } else {
          setError(`unknown mode: ${mode}`);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "verification failed";
        setError(message);
      }
    }

    processOAuth();
  }, [searchParams, address, navigate]);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-[#FF0000] text-xs mb-4">
              {"// ERR: "}
              {error}
              {" //"}
            </p>
            <button
              onClick={() => navigate(-1)}
              className="text-xs text-[#9C9C9D] hover:text-[#F25C05] transition-colors"
            >
              {">"} go back
            </button>
          </>
        ) : (
          <p className="text-xs text-[#9C9C9D]">{status}</p>
        )}
      </div>
    </div>
  );
}
