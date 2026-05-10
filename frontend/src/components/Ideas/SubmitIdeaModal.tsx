import { useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import { X, Loader2, Twitter, Wallet, LogOut, ChevronDown, ChevronUp, Link2, Check, Share2, Sparkles, Send, Bot, RotateCcw } from "lucide-react";
import { UserProfile, NewIdeaForm } from "./types";
import { ideaCategories } from "./constants";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ShareInfo {
  slug: string;
  title: string;
}

interface SubmitIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (idea: NewIdeaForm) => Promise<{ slug?: string; title?: string } | void>;
  userProfile: UserProfile;
  onConnectX: () => void;
  onDisconnectX?: () => void;
  isConnectingX: boolean;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
  isConnectingWallet?: boolean;
}

export function SubmitIdeaModal({
  isOpen,
  onClose,
  onSubmit,
  userProfile,
  onConnectX,
  onDisconnectX,
  isConnectingX,
  onConnectWallet,
  onDisconnectWallet,
  isConnectingWallet,
}: SubmitIdeaModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"manual" | "ai" | "tweet">("manual");

  // Restore AI tab if we're returning from OAuth
  useEffect(() => {
    if (isOpen && localStorage.getItem('spark_reopen_submit_modal')) {
      localStorage.removeItem('spark_reopen_submit_modal');
      setActiveTab("ai");
    }
  }, [isOpen]);
  const [tweetLink, setTweetLink] = useState("");
  const [isFetchingTweet, setIsFetchingTweet] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiIdeaReady, setAiIdeaReady] = useState(false);
  const [aiIdeaData, setAiIdeaData] = useState<NewIdeaForm | null>(null);
  const [aiLaunching, setAiLaunching] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat without stealing focus
  useEffect(() => {
    if (chatEndRef.current) {
      const container = chatEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
    // Re-focus input after messages update
    if (activeTab === "ai" && !aiLoading) {
      setTimeout(() => aiInputRef.current?.focus(), 50);
    }
  }, [aiMessages, aiLoading]);

  // Send first AI message when tab opens and user is connected
  useEffect(() => {
    if (activeTab === "ai" && aiMessages.length === 0 && !aiLoading && userProfile.xConnected && userProfile.walletConnected) {
      handleAiSend("Hello");
    }
  }, [activeTab, userProfile.xConnected, userProfile.walletConnected]);

  const handleAiSend = async (overrideMessage?: string) => {
    const message = overrideMessage || aiInput.trim();
    if (!message || aiLoading) return;

    const userMessages = overrideMessage
      ? aiMessages
      : [...aiMessages, { role: "user" as const, content: message }];

    if (!overrideMessage) {
      setAiMessages(userMessages);
      setAiInput("");
    }

    setAiLoading(true);
    try {
      const res = await fetch("/api/idea-ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: userMessages }),
      });

      if (!res.ok) throw new Error("AI chat failed");

      const data = await res.json() as {
        reply: string;
        ideaReady: boolean;
        ideaData?: {
          title: string;
          description: string;
          coinName: string;
          ticker: string;
          category: string;
          estimatedPrice: number;
          why: string;
          marketSize: string;
          competitors: string;
        };
      };

      const newMessages = [
        ...userMessages,
        { role: "assistant" as const, content: data.reply },
      ];
      setAiMessages(newMessages);

      if (data.ideaReady && data.ideaData) {
        setAiIdeaReady(true);
        setAiIdeaData({
          idea: data.ideaData.title,
          coinName: data.ideaData.coinName,
          ticker: data.ideaData.ticker,
          category: data.ideaData.category || "DeFi",
          description: data.ideaData.description,
          estimatedPrice: data.ideaData.estimatedPrice,
          why: data.ideaData.why || "",
          marketSize: data.ideaData.marketSize || "",
          competitors: data.ideaData.competitors || "",
        });
      }
    } catch {
      toast.error("Failed to communicate with AI. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiLaunch = async () => {
    if (!userProfile.xConnected || aiLaunching) return;
    setAiLaunching(true);
    try {
      const res = await fetch("/api/idea-ai-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: aiMessages,
          userProfile: {
            username: userProfile.xUsername,
            avatar: userProfile.xAvatar,
            twitterId: userProfile.xId,
            walletAddress: userProfile.walletAddress,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to launch idea");
      }

      const data = await res.json() as { slug: string; title: string };

      // Reset AI state
      setAiMessages([]);
      setAiIdeaReady(false);
      setAiIdeaData(null);
      setActiveTab("manual");

      // Show share popup
      setShareInfo({ slug: data.slug, title: data.title });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to launch idea");
    } finally {
      setAiLaunching(false);
    }
  };

  const [newIdea, setNewIdea] = useState<NewIdeaForm>({
    idea: "",
    coinName: "",
    ticker: "",
    category: "DeFi",
    description: "",
    estimatedPrice: 0,
    why: "",
    marketSize: "",
    competitors: "",
  });

  if (!isOpen) return null;

  const getIdeaUrl = (slug: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://justspark.fun';
    return `${baseUrl}/ideas/${slug}`;
  };

  const handleCopyLink = async () => {
    if (!shareInfo) return;
    const url = getIdeaUrl(shareInfo.slug);
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShareOnTwitter = () => {
    if (!shareInfo) return;
    const url = getIdeaUrl(shareInfo.slug);
    const text = `Check out this idea on @sparkdotfun: "${shareInfo.title}"`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCloseSharePopup = () => {
    const slug = shareInfo?.slug;
    setShareInfo(null);
    setLinkCopied(false);
    onClose();
    if (slug) {
      window.location.href = `/ideas/${slug}`;
    }
  };

  // Show share popup if we have share info
  if (shareInfo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={handleCloseSharePopup} />
        <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-neutral-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 border border-white/[0.06] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <h2 className="text-base font-satoshi font-bold text-white">Idea Submitted!</h2>
            </div>
            <button onClick={handleCloseSharePopup} className="text-neutral-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-5">
            <p className="text-sm text-neutral-400 mb-5 text-center font-geist">
              Your idea "<span className="text-white font-medium">{shareInfo.title}</span>" has been submitted successfully. Share it with your network!
            </p>

            <div className="space-y-3">
              {/* Share on Twitter */}
              <button
                onClick={handleShareOnTwitter}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl font-satoshi text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors"
              >
                <Twitter className="w-4 h-4" />
                Share on X (Twitter)
              </button>

              {/* Copy Link */}
              <button
                onClick={handleCopyLink}
                className={`w-full flex items-center justify-center gap-2 py-3 border rounded-xl font-satoshi text-sm font-medium transition-colors ${
                  linkCopied
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-white/[0.04] border-white/[0.06] text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {linkCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Link Copied!
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Copy Link
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/[0.06] bg-white/[0.03]">
            <button
              onClick={handleCloseSharePopup}
              className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-satoshi font-semibold text-sm rounded-xl hover:from-orange-400 hover:to-amber-400 transition-colors"
            >
              View My Idea
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!userProfile.xConnected || !newIdea.idea.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await onSubmit(newIdea);
      const submittedTitle = newIdea.idea;
      setNewIdea({
        idea: "",
        coinName: "",
        ticker: "",
        category: "DeFi",
        description: "",
        estimatedPrice: 0,
        why: "",
        marketSize: "",
        competitors: "",
      });
      setShowMoreDetails(false);
      setActiveTab("manual");
      
      // Show share popup if we got a slug back
      if (result?.slug) {
        setShareInfo({ slug: result.slug, title: result.title || submittedTitle });
      } else {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitTweet = async () => {
    if (!userProfile.xConnected || !tweetLink.trim()) return;
    setIsSubmitting(true);
    setIsFetchingTweet(true);
    try {
      // First, get tweet info from fxtwitter
      console.log("🔍 [FRONTEND] Fetching tweet info from fxtwitter:", tweetLink);
      const tweetInfoResponse = await fetch('/api/get-tweet-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet_link: tweetLink }),
      });

      if (!tweetInfoResponse.ok) {
        const errorData = await tweetInfoResponse.json();
        throw new Error(errorData.message || 'Failed to fetch tweet info');
      }

      const tweetInfo = await tweetInfoResponse.json();
      console.log("✅ [FRONTEND] Tweet info fetched:", tweetInfo);

      // Then, create idea from tweet
      console.log("🔄 [FRONTEND] Creating idea from tweet...");
      const ideaResponse = await fetch('/api/ideas-from-tweet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: tweetInfo.username,
          tweetUrl: tweetLink,
          tweetContent: tweetInfo.tweetContent,
        }),
      });

      if (!ideaResponse.ok) {
        const errorData = await ideaResponse.json();
        throw new Error(errorData.message || errorData.reason || 'Failed to create idea from tweet');
      }

      const ideaData = await ideaResponse.json();
      console.log("✅ [FRONTEND] Idea created from tweet:", ideaData);

      // Reset form
      setTweetLink("");
      setActiveTab("manual");
      
      // Show share popup
      if (ideaData.slug) {
        setShareInfo({ slug: ideaData.slug, title: ideaData.title || "New Idea" });
      } else {
        onClose();
        window.location.reload();
      }
    } catch (error) {
      console.error('❌ [FRONTEND] Failed to submit tweet:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit tweet. Please try again.');
    } finally {
      setIsSubmitting(false);
      setIsFetchingTweet(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden rounded-2xl bg-neutral-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 border border-white/[0.06] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-base font-satoshi font-bold text-white">Submit New Idea</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex-1 px-4 py-3 text-sm font-satoshi font-bold transition-colors border-b-2 text-center flex items-center justify-center gap-1.5 ${
              activeTab === "ai"
                ? "text-purple-400 border-purple-400 bg-white/[0.08]"
                : "text-neutral-400 border-transparent hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Prompt with AI
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex-1 px-4 py-3 text-sm font-satoshi font-bold transition-colors border-b-2 text-center ${
              activeTab === "manual"
                ? "text-orange-400 border-orange-400 bg-white/[0.08]"
                : "text-neutral-400 border-transparent hover:text-white"
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => setActiveTab("tweet")}
            className={`flex-1 px-4 py-3 text-sm font-satoshi font-bold transition-colors border-b-2 text-center ${
              activeTab === "tweet"
                ? "text-orange-400 border-orange-400 bg-white/[0.08]"
                : "text-neutral-400 border-transparent hover:text-white"
            }`}
          >
            From Tweet
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {activeTab === "ai" ? (
          <div className="flex flex-col h-full min-h-[400px]">
            {/* X + Wallet connection required before chat */}
            {(!userProfile.xConnected || !userProfile.walletConnected) ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-2">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
                <p className="text-sm text-neutral-400 text-center max-w-xs font-geist">
                  Connect your X account and wallet to start chatting with Spark AI
                </p>
                <div className="w-full max-w-xs space-y-3">
                  {!userProfile.xConnected && (
                    <button
                      onClick={onConnectX}
                      disabled={isConnectingX}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl font-satoshi text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                      {isConnectingX ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                      ) : (
                        <><Twitter className="w-4 h-4" /> Connect with X</>
                      )}
                    </button>
                  )}
                  {userProfile.xConnected && !userProfile.walletConnected && onConnectWallet && (
                    <button
                      onClick={onConnectWallet}
                      disabled={isConnectingWallet}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500/10 border border-orange-500/20 rounded-xl font-satoshi text-orange-400 text-sm font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                    >
                      {isConnectingWallet ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                      ) : (
                        <><Wallet className="w-4 h-4" /> Connect Wallet</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Chat messages */}
                <div className="flex-1 space-y-3 mb-4 overflow-y-auto">
                  {aiMessages.filter(m => !(m.role === "user" && m.content === "Hello" && aiMessages.indexOf(m) === 0)).map((msg, i) => (
                    <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5 text-purple-400" />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm font-geist leading-relaxed ${
                          msg.role === "user"
                            ? "bg-orange-500/20 border border-orange-500/20 text-white rounded-br-md"
                            : "bg-white/[0.03] border border-white/[0.06] text-neutral-200 rounded-bl-md"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : (
                          msg.content
                        )}
                      </div>
                      {msg.role === "user" && userProfile.xAvatar ? (
                        <img src={userProfile.xAvatar} alt={userProfile.xUsername} className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                      ) : msg.role === "user" ? (
                        <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs text-orange-400 font-bold">{userProfile.xUsername?.charAt(0).toUpperCase() || "?"}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex gap-2.5 justify-start">
                      <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-white/[0.03] border border-white/[0.06]">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Launch Idea button inline after AI summary */}
                  {aiIdeaReady && !aiLoading && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={handleAiLaunch}
                        disabled={!userProfile.xConnected || aiLaunching}
                        className="px-6 py-2.5 bg-purple-500 text-white font-semibold text-sm rounded-xl hover:bg-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-purple-500/20"
                      >
                        {aiLaunching ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Launching...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Launch Idea
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat input */}
                <div className="flex gap-2">
                  <input
                    ref={aiInputRef}
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiSend(); } }}
                    placeholder="Describe your idea..."
                    disabled={aiLoading}
                    autoFocus
                    className="flex-1 h-11 px-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-purple-500/30 transition-colors disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleAiSend()}
                    disabled={!aiInput.trim() || aiLoading}
                    className="h-11 w-11 flex items-center justify-center bg-purple-500 rounded-xl text-white hover:bg-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
          ) : activeTab === "manual" ? (
          <div className="space-y-5">
            {/* X Connection + Wallet Connection side by side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Connect with X */}
              <div>
                <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-2 block">
                  Connect with X *
                </label>
                {userProfile.xConnected ? (
                  <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-center gap-3">
                      <img src={userProfile.xAvatar} alt={userProfile.xUsername} className="w-8 h-8 rounded-full" />
                      <div>
                        <p className="text-sm font-medium text-white">{userProfile.xName}</p>
                        <p className="text-xs text-emerald-400">@{userProfile.xUsername}</p>
                      </div>
                    </div>
                    {onDisconnectX && (
                      <button onClick={onDisconnectX} className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-white/[0.06] transition-all" title="Disconnect X">
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={onConnectX}
                    disabled={isConnectingX}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl font-satoshi text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    {isConnectingX ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Twitter className="w-4 h-4" />
                        Connect with X
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Connect Wallet */}
              <div>
                <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-2 block">
                  Wallet to claim fees *
                </label>
                {userProfile.walletConnected && userProfile.walletAddress ? (
                  <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Wallet className="w-5 h-5 text-emerald-400" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {userProfile.walletAddress.slice(0, 4)}...{userProfile.walletAddress.slice(-4)}
                        </p>
                        <p className="text-xs text-emerald-400">Wallet connected</p>
                      </div>
                    </div>
                    {onDisconnectWallet && (
                      <button onClick={onDisconnectWallet} className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-white/[0.06] transition-all" title="Disconnect wallet">
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : onConnectWallet ? (
                  <button
                    onClick={onConnectWallet}
                    disabled={isConnectingWallet}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500/10 border border-orange-500/20 rounded-xl font-satoshi text-orange-400 text-sm font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                  >
                    {isConnectingWallet ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wallet className="w-4 h-4" />
                        Connect Wallet
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Idea Title */}
            <div>
              <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                Idea *
              </label>
              <input
                type="text"
                value={newIdea.idea}
                onChange={(e) => setNewIdea({ ...newIdea, idea: e.target.value })}
                placeholder="Your idea in one sentence..."
                className="w-full h-11 px-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors"
              />
            </div>

            {/* Coin Name & Ticker */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                  Coin Name *
                </label>
                <input
                  type="text"
                  value={newIdea.coinName}
                  onChange={(e) => setNewIdea({ ...newIdea, coinName: e.target.value })}
                  placeholder="e.g. SparkCoin"
                  className="w-full h-11 px-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                  Ticker *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">$</span>
                  <input
                    type="text"
                    value={newIdea.ticker}
                    onChange={(e) => setNewIdea({ ...newIdea, ticker: e.target.value.toUpperCase() })}
                    placeholder="e.g. SPARK"
                    className="w-full h-11 pl-7 pr-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-mono font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                Category
              </label>
              <select
                value={newIdea.category}
                onChange={(e) => setNewIdea({ ...newIdea, category: e.target.value })}
                className="w-full h-11 px-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist focus:outline-none focus:border-orange-500/30 transition-colors appearance-none cursor-pointer"
              >
                {ideaCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                Description
              </label>
              <textarea
                value={newIdea.description}
                onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
                placeholder="Describe your idea: what problem does it solve and how?"
                rows={4}
                className="w-full p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors resize-none"
              />
            </div>

            {/* Budget - Mandatory */}
            <div>
              <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                Estimated Budget for V1 (USD) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">$</span>
                <input
                  type="number"
                  value={newIdea.estimatedPrice || ""}
                  onChange={(e) => setNewIdea({ ...newIdea, estimatedPrice: parseInt(e.target.value) || 0 })}
                  placeholder="e.g. 25000"
                  min="0"
                  className="w-full h-11 pl-7 pr-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors"
                />
              </div>
            </div>

            {/* Collapsible More Details Section */}
            <div className="border-t border-white/[0.06] pt-4">
              <button
                onClick={() => setShowMoreDetails(!showMoreDetails)}
                className="flex items-center justify-between w-full text-[11px] font-satoshi font-bold text-neutral-400 uppercase tracking-wide hover:text-white transition-colors"
              >
                <span>Add More Details (Optional)</span>
                {showMoreDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showMoreDetails && (
                <div className="mt-4 space-y-4">
                  {/* Why */}
                  <div>
                    <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                      Why (the deeper problem/thesis)
                    </label>
                    <textarea
                      value={newIdea.why || ""}
                      onChange={(e) => setNewIdea({ ...newIdea, why: e.target.value })}
                      placeholder="Explain the deeper problem or thesis..."
                      rows={3}
                      className="w-full p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors resize-none"
                    />
                  </div>

                  {/* Market Size */}
                  <div>
                    <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                      Market Size
                    </label>
                    <textarea
                      value={newIdea.marketSize || ""}
                      onChange={(e) => setNewIdea({ ...newIdea, marketSize: e.target.value })}
                      placeholder="Describe the market size and opportunity..."
                      rows={3}
                      className="w-full p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors resize-none"
                    />
                  </div>

                  {/* Competitors */}
                  <div>
                    <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                      Competitors
                    </label>
                    <textarea
                      value={newIdea.competitors || ""}
                      onChange={(e) => setNewIdea({ ...newIdea, competitors: e.target.value })}
                      placeholder="List and analyze competitors..."
                      rows={3}
                      className="w-full p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          ) : (
          <div className="space-y-5">
            {/* X Connection */}
            <div>
              <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-2 block">
                Connect with X *
              </label>
              {userProfile.xConnected ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <img src={userProfile.xAvatar} alt={userProfile.xUsername} className="w-8 h-8 rounded-full" />
                  <div>
                    <p className="text-sm font-medium text-white">{userProfile.xName}</p>
                    <p className="text-xs text-emerald-400">@{userProfile.xUsername}</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onConnectX}
                  disabled={isConnectingX}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl font-satoshi text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  {isConnectingX ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Twitter className="w-4 h-4" />
                      Connect with X to submit
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Tweet Link Input */}
            <div>
              <label className="text-[11px] font-satoshi font-medium text-neutral-400 uppercase tracking-wide mb-1.5 block">
                Tweet Link *
              </label>
              <input
                type="text"
                value={tweetLink}
                onChange={(e) => setTweetLink(e.target.value)}
                placeholder="https://x.com/username/status/1234567890"
                className="w-full h-11 px-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm font-geist placeholder-neutral-500 focus:outline-none focus:border-orange-500/30 transition-colors"
              />
              <p className="text-[10px] text-neutral-500 mt-1.5 font-geist">
                Paste the full URL of the tweet you want to convert into an idea
              </p>
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] bg-white/[0.03] shrink-0">
          {/* Left side: Reset (AI tab only) */}
          <div>
            {activeTab === "ai" && aiMessages.length > 0 && (
              <button
                onClick={() => {
                  setAiMessages([]);
                  setAiIdeaReady(false);
                  setAiIdeaData(null);
                  setAiInput("");
                }}
                disabled={aiLoading || aiLaunching}
                className="flex items-center gap-1.5 px-3 py-2 text-neutral-500 text-xs font-satoshi font-medium hover:text-white hover:bg-white/[0.06] rounded-xl transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>

          {/* Right side: Cancel + action buttons */}
          <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-400 text-sm font-satoshi font-medium hover:text-white transition-colors"
          >
            Cancel
          </button>
          {activeTab === "manual" ? (
            <button
              onClick={handleSubmit}
              disabled={!userProfile.xConnected || !newIdea.idea.trim() || !newIdea.coinName.trim() || !newIdea.ticker.trim() || !newIdea.estimatedPrice || isSubmitting}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-satoshi font-semibold text-sm rounded-xl hover:from-orange-400 hover:to-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Idea"
              )}
            </button>
          ) : activeTab === "tweet" ? (
            <button
              onClick={handleSubmitTweet}
              disabled={!userProfile.xConnected || !tweetLink.trim() || isSubmitting}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-satoshi font-semibold text-sm rounded-xl hover:from-orange-400 hover:to-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isFetchingTweet ? "Fetching tweet..." : "Creating idea..."}
                </>
              ) : (
                "Submit Tweet"
              )}
            </button>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubmitIdeaModal;
