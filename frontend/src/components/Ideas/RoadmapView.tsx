import { Clock } from "lucide-react";

export function RoadmapView() {
  return (
    <div className="max-w-2xl mx-auto animate-fade-in text-center py-20">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-900/50 border border-white/5 mb-6">
        <Clock className="w-8 h-8 text-neutral-500" />
      </div>
      <h2 className="text-2xl font-semibold text-white mb-3">Coming Soon...</h2>
      <p className="text-sm text-neutral-500 mb-8">
        Our roadmap is currently being developed. Check back soon for updates on upcoming features and milestones.
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5">
        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
        <span className="text-xs text-neutral-400">In Development</span>
      </div>
    </div>
  );
}

export default RoadmapView;
