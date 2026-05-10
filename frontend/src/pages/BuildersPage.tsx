import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import HackathonLayout from "@/components/Hackathon/HackathonLayout";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import { withSwrCache } from "@/utils/miniCache";
import type { Builder } from "@/components/Hackathon/types";

const SKILLS_OPTIONS = [
  "Rust",
  "TypeScript",
  "React",
  "Python",
  "Solana",
  "Anchor",
  "Node.js",
  "Go",
  "Solidity",
];
const ROLE_OPTIONS = [
  "Software Engineer",
  "Backend Dev",
  "Frontend Dev",
  "Protocol Engineer",
  "AI/ML",
  "Designer",
];
const INTERESTS_OPTIONS = [
  "DeFi",
  "DePIN",
  "Consumer",
  "Dev Infra",
  "Social",
  "Gaming",
  "AI",
  "Data",
];

const PAGE_SIZE = 50;

export default function BuildersPage() {
  const [search, setSearch] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(
    new Set()
  );
  const [locationFilter, setLocationFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["builders"],
    ...withSwrCache(
      () => backendSparkApi.getBuilders(),
      "desktop_cache_builders",
      30 * 60_000,
    ),
    refetchOnWindowFocus: false,
  });

  const buildersList = (apiData?.builders || []) as unknown as Builder[];

  const toggleSet = (
    set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    value: string
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    const locationLower = locationFilter.toLowerCase();

    return buildersList.filter((builder) => {
      // Search filter
      if (searchLower) {
        const matchesSearch =
          builder.username.toLowerCase().includes(searchLower) ||
          builder.display_name.toLowerCase().includes(searchLower) ||
          builder.about.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Skills filter (AND — must have ALL selected)
      const skills = Array.isArray(builder.skills) ? builder.skills : [];
      const roles = Array.isArray(builder.i_am_a) ? builder.i_am_a : [];
      const interests = Array.isArray(builder.interested_in) ? builder.interested_in : [];

      if (selectedSkills.size > 0) {
        for (const skill of selectedSkills) {
          if (!skills.includes(skill)) return false;
        }
      }

      // Role filter (OR — must have at least one)
      if (selectedRoles.size > 0) {
        const hasRole = roles.some((role) => selectedRoles.has(role));
        if (!hasRole) return false;
      }

      // Interests filter (OR — must have at least one)
      if (selectedInterests.size > 0) {
        const hasInterest = interests.some((interest) =>
          selectedInterests.has(interest)
        );
        if (!hasInterest) return false;
      }

      // Location filter
      if (locationLower) {
        if (!(builder.city || "").toLowerCase().includes(locationLower)) return false;
      }

      return true;
    });
  }, [buildersList, search, selectedSkills, selectedRoles, selectedInterests, locationFilter]);

  const shown = Math.min(visibleCount, filtered.length);
  const visibleBuilders = filtered.slice(0, shown);

  return (
    <HackathonLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-5xl mx-auto px-6 pt-24 pb-16"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#F5F5F6] uppercase tracking-wider">
            <span className="text-[#F25C05]">&gt;</span> BUILDERS
          </h1>
          <span className="text-xs text-[#A0A3A9]">{buildersList.length.toLocaleString()} indexed</span>
        </div>

        {/* Search */}
        <div className="mt-6 flex items-center gap-2">
          <span className="text-xs text-[#A0A3A9]">search:</span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="bg-transparent border-b border-[#444B57] text-xs text-[#F5F5F6] px-1 py-1 w-full max-w-md focus:border-[#F25C05] outline-none transition-colors font-mono"
            placeholder=""
          />
        </div>

        {/* Filters */}
        {/* SKILLS */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[10px] text-[#A0A3A9] uppercase tracking-widest w-20 flex-shrink-0">
            SKILLS
          </span>
          {SKILLS_OPTIONS.map((skill) => (
            <span
              key={skill}
              onClick={() =>
                toggleSet(selectedSkills, setSelectedSkills, skill)
              }
              className={
                selectedSkills.has(skill)
                  ? "text-[10px] text-[#F25C05] border border-[#F25C05]/30 bg-[#F25C05]/5 px-1.5 py-0.5 cursor-pointer"
                  : "text-[10px] text-[#A0A3A9] border border-[#444B57] px-1.5 py-0.5 cursor-pointer hover:border-[#B0B3B8] transition-colors"
              }
            >
              {skill}
            </span>
          ))}
        </div>

        {/* ROLE */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[10px] text-[#A0A3A9] uppercase tracking-widest w-20 flex-shrink-0">
            ROLE
          </span>
          {ROLE_OPTIONS.map((role) => (
            <span
              key={role}
              onClick={() => toggleSet(selectedRoles, setSelectedRoles, role)}
              className={
                selectedRoles.has(role)
                  ? "text-[10px] text-[#F25C05] border border-[#F25C05]/30 bg-[#F25C05]/5 px-1.5 py-0.5 cursor-pointer"
                  : "text-[10px] text-[#A0A3A9] border border-[#444B57] px-1.5 py-0.5 cursor-pointer hover:border-[#B0B3B8] transition-colors"
              }
            >
              {role}
            </span>
          ))}
        </div>

        {/* INTERESTS */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[10px] text-[#A0A3A9] uppercase tracking-widest w-20 flex-shrink-0">
            INTERESTS
          </span>
          {INTERESTS_OPTIONS.map((interest) => (
            <span
              key={interest}
              onClick={() =>
                toggleSet(selectedInterests, setSelectedInterests, interest)
              }
              className={
                selectedInterests.has(interest)
                  ? "text-[10px] text-[#F25C05] border border-[#F25C05]/30 bg-[#F25C05]/5 px-1.5 py-0.5 cursor-pointer"
                  : "text-[10px] text-[#A0A3A9] border border-[#444B57] px-1.5 py-0.5 cursor-pointer hover:border-[#B0B3B8] transition-colors"
              }
            >
              {interest}
            </span>
          ))}
        </div>

        {/* LOCATION */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[10px] text-[#A0A3A9] uppercase tracking-widest w-20 flex-shrink-0">
            LOCATION
          </span>
          <input
            type="text"
            value={locationFilter}
            onChange={(e) => {
              setLocationFilter(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="bg-transparent border-b border-[#444B57] text-[10px] text-[#F5F5F6] px-1 py-0.5 w-full max-w-xs focus:border-[#F25C05] outline-none transition-colors font-mono"
            placeholder=""
          />
        </div>

        <div className="mt-6" />

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border border-[#F25C05] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-[#B0B3B8] ml-3 font-mono">loading builders...</span>
          </div>
        )}

        {/* Builder Cards */}
        {!isLoading && <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.03,
              },
            },
          }}
        >
          {visibleBuilders.map((builder) => (
            <motion.div
              key={builder.id}
              variants={{
                hidden: { opacity: 0, y: 6 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.3 }}
            >
              <Link
                to={`/builders/${builder.username}`}
                className="border border-dashed border-[#2A3040] hover:border-[#F25C05]/40 transition-all duration-300 cursor-pointer flex items-stretch"
              >
                {/* Avatar strip */}
                <div className="w-14 shrink-0 border-r border-dashed border-[#2A3040] flex items-center justify-center p-2">
                  <img
                    src={builder.avatar_url || `https://unavatar.io/twitter/${builder.username}`}
                    alt={builder.username}
                    className="w-10 h-10 rounded-full object-cover opacity-80"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://unavatar.io/twitter/${builder.username}`;
                    }}
                  />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0 p-3">
                  {/* Row 1: name + location + role */}
                  <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4">
                    <div className="min-w-0">
                      {builder.display_name && builder.display_name !== builder.username ? (
                        <span className="text-sm font-bold text-[#F5F5F6] truncate block">{builder.display_name}</span>
                      ) : null}
                      <span className="text-xs text-[#A0A3A9] font-mono truncate block">@{builder.username}</span>
                    </div>
                    <span className="text-xs text-[#A0A3A9] text-center w-32 truncate">
                      {builder.city}
                    </span>
                    <span className="flex items-center gap-2 justify-end w-44">
                      <span className="text-xs text-[#B0B3B8] truncate">
                        {(Array.isArray(builder.i_am_a) ? builder.i_am_a : [])[0] || ""}
                      </span>
                      {!(builder as any).claimed && (builder as any).source === "colosseum" && (
                        <span className="text-[8px] text-[#F25C05]/60 border border-[#F25C05]/20 px-1 shrink-0">
                          colosseum
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Row 2: about snippet */}
                  {builder.about && (
                    <p className="text-[10px] text-[#555E6B] mt-1 truncate font-mono">
                      {builder.about}
                    </p>
                  )}

                  {/* Row 3: skills + interests */}
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1.5">
                      {(Array.isArray(builder.skills) ? builder.skills : []).slice(0, 4).map((skill) => (
                        <span key={skill} className="text-[10px] text-[#F25C05]">
                          [{skill}]
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] text-[#B0B3B8]">
                      {(Array.isArray(builder.interested_in) ? builder.interested_in : []).slice(0, 3).join(" · ")}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>}

        {/* Pagination */}
        {shown < filtered.length && (
          <div
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="text-xs text-[#B0B3B8] hover:text-[#F25C05] cursor-pointer text-center mt-6"
          >
            &gt; load more (showing {shown} of {filtered.length})
          </div>
        )}
      </motion.div>
    </HackathonLayout>
  );
}
