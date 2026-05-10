import { DollarSign, Code, Users, Twitter, ExternalLink, Briefcase, Lock } from "lucide-react";
import { builderTeams, availabilityColors } from "./constants";

export function TeamsView() {
  return (
    <div className="max-w-6xl mx-auto animate-fade-in relative">
      {/* Coming Soon Overlay */}
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="bg-neutral-900/90 backdrop-blur-sm border border-orange-500/20 rounded-2xl px-8 py-6 text-center shadow-2xl">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-4">
            <Lock className="w-7 h-7 text-orange-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Coming Soon</h3>
          <p className="text-sm text-neutral-400 max-w-xs">
            Team discovery and funding features are currently in development.
          </p>
        </div>
      </div>

      {/* Blurred Content */}
      <div className="blur-sm pointer-events-none select-none">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-4">
            <DollarSign className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-2xl font-semibold text-white tracking-tight mb-3">We Fund Teams</h2>
          <p className="text-sm text-neutral-400 max-w-xl mx-auto mb-2">
            The market helps find the ideas. We fund the teams that build them.
          </p>
          <p className="text-xs text-neutral-500 max-w-lg mx-auto">
            Browse builder teams in the Solana ecosystem. Connect with experienced developers ready to bring your ideas to life.
          </p>
        </div>

        {/* Teams List */}
        <div className="space-y-4">
          {builderTeams.map((team) => {
            const availStyle = availabilityColors[team.availability];
            return (
              <div
                key={team.id}
                className="p-5 rounded-xl bg-neutral-900/30 border border-white/5 hover:border-orange-500/20 transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {team.logo ? (
                      <img src={team.logo} alt={team.name} className="w-12 h-12 rounded-xl border border-white/5 group-hover:border-orange-500/30 transition-colors shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                        <Code className="w-6 h-6 text-orange-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-base font-semibold text-white group-hover:text-orange-100 transition-colors">{team.name}</h4>
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${availStyle.bg}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${availStyle.dot}`} />
                          <span className={`text-[10px] font-medium ${availStyle.text}`}>{team.availability}</span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2 mb-2">{team.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {team.focus.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded text-[9px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap md:flex-nowrap items-center gap-4 md:gap-6 text-center md:text-left shrink-0">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-neutral-500" />
                      <div>
                        <p className="text-sm font-semibold text-white">{team.buildersCount}</p>
                        <p className="text-[10px] text-neutral-500">Builders</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-400">{team.totalEarned}</p>
                        <p className="text-[10px] text-neutral-500">Earned</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-neutral-500" />
                      <div>
                        <p className="text-sm font-semibold text-white">{team.experience.length}</p>
                        <p className="text-[10px] text-neutral-500">Projects</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {team.twitter && (
                      <a href={`https://x.com/${team.twitter}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-neutral-800/50 border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all">
                        <Twitter className="w-4 h-4 text-blue-400" />
                      </a>
                    )}
                    {team.website && (
                      <a href={team.website} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-neutral-800/50 border border-white/5 hover:border-white/20 hover:bg-white/5 transition-all">
                        <ExternalLink className="w-4 h-4 text-neutral-400" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Experience & Portfolio</p>
                  <div className="flex flex-wrap gap-2">
                    {team.experience.map((exp, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-neutral-800/50 text-neutral-300 border border-white/5">{exp}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-sm text-neutral-400 mb-4">Are you a builder team looking for funding?</p>
          <a href="https://t.me/Mathis_btc" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-black font-semibold text-sm rounded-lg hover:bg-orange-400 transition-colors">
            Apply as a Team
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default TeamsView;
