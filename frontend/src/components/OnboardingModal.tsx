import { useState, useEffect } from "react";
import { X, Lightbulb, TrendingUp, MessageSquare, DollarSign } from "lucide-react";

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user has seen the onboarding before
    const hasSeenOnboarding = localStorage.getItem('spark-onboarding-seen');
    if (!hasSeenOnboarding) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('spark-onboarding-seen', 'true');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={handleClose}
      />
      <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto bg-neutral-900/95 border border-white/10 rounded-2xl shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-white/5 bg-neutral-900/95 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white">Welcome to Spark Ideas ✨</h2>
          <button 
            onClick={handleClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Spark Ideas is a platform where the community discovers, votes, and funds innovative Web3 projects. 
            Here's how it works:
          </p>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex gap-4 p-4 rounded-xl bg-neutral-800/50 border border-white/5">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white mb-1">1. Discover Ideas</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Browse innovative ideas from the community. Each idea includes a problem statement, solution, 
                  and funding goal.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4 p-4 rounded-xl bg-neutral-800/50 border border-white/5">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white mb-1">2. Vote & Discuss</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Connect your X (Twitter) account to upvote or downvote ideas and comments. 
                  You have 5 votes per day to support the best ideas.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4 p-4 rounded-xl bg-neutral-800/50 border border-white/5">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white mb-1">3. Share Your Thoughts</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Comment on ideas, reply to discussions, and engage with the community. 
                  Your voice helps shape the future of Web3.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4 p-4 rounded-xl bg-neutral-800/50 border border-white/5">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white mb-1">4. Invest in Ideas</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Connect your Solana wallet to invest USDC in ideas you believe in. 
                  Track funding progress and see your investments grow.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <button
              onClick={handleClose}
              className="w-full py-3 bg-orange-500 text-black font-semibold text-sm rounded-lg hover:bg-orange-400 transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingModal;
