// File: functions/scraper/colosseum-scraper.ts
// Scraper for Colosseum Agent Hackathon projects
// Uses official API when available, falls back to HTML scraping

interface ColosseumProject {
  title: string;
  description: string;
  teamName: string;
  status: string;
  humanVotes: number;
  agentVotes: number;
  totalVotes: number;
  colosseumUrl: string;
  colosseumProjectId: string;
  slug: string;
  categories?: string[]; // Tags like Trading, DeFi, AI
  repositoryUrl?: string; // GitHub repo
  demoUrl?: string; // Technical Demo link
  teamMembers?: string[]; // Team member names (e.g. "Name — Joined DD/MM/YYYY")
  tokenAddress?: string; // e.g. $SR: 48BbwbZHWc8QJBiuGJTQZD5aWZdP3i6xrDw5N9EHpump
}

const COLOSSEUM_API_BASE = "https://agents.colosseum.com/api/projects/current";

interface ColosseumApiProject {
  id: number;
  name: string;
  slug: string;
  description: string;
  repoLink: string | null;
  presentationLink: string | null;
  humanUpvotes: number;
  agentUpvotes: number;
  ownerAgentName: string;
  teamName: string | null;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
}

interface ColosseumApiResponse {
  projects: ColosseumApiProject[];
  totalCount: number;
  hasMore: boolean;
}

export class ColosseumScraper {
  private db: D1Database;
  private baseUrl = "https://colosseum.com/agent-hackathon/projects";

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Fetch all projects from Colosseum's official API (recommended).
   * Gets full list with description, repo, demo link, votes, team.
   */
  async scrapeProjectsFromApi(): Promise<ColosseumProject[]> {
    const limit = 100;
    let offset = 0;
    const all: ColosseumProject[] = [];
    let hasMore = true;

    console.log("🔍 [SCRAPER] Fetching projects from Colosseum API...");

    while (hasMore) {
      const url = `${COLOSSEUM_API_BASE}?sortBy=human_upvotes&limit=${limit}&offset=${offset}&includeDrafts=true`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SparkBot/1.0' },
      });

      if (!response.ok) {
        throw new Error(`Colosseum API HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as ColosseumApiResponse;
      const apiProjects = data.projects || [];
      hasMore = data.hasMore === true && apiProjects.length > 0;

      for (const p of apiProjects) {
        const humanVotes = p.humanUpvotes ?? 0;
        const agentVotes = p.agentUpvotes ?? 0;
        all.push({
          title: p.name || p.slug,
          description: p.description || "No description available",
          teamName: p.teamName || p.ownerAgentName || "Unknown Team",
          status: p.status === "submitted" ? "Published" : "Draft",
          humanVotes,
          agentVotes,
          totalVotes: humanVotes + agentVotes,
          colosseumUrl: `https://colosseum.com/agent-hackathon/projects/${p.slug}`,
          colosseumProjectId: p.slug,
          slug: this.generateSlug(p.name || p.slug),
          repositoryUrl: p.repoLink || undefined,
          demoUrl: p.presentationLink || undefined,
          teamMembers: p.ownerAgentName ? [p.ownerAgentName] : undefined,
        });
      }

      console.log(`  📦 [SCRAPER] Page offset ${offset}: ${apiProjects.length} projects (total so far: ${all.length})`);
      offset += limit;
      if (apiProjects.length < limit || !data.hasMore) hasMore = false;
    }

    console.log(`✅ [SCRAPER] API returned ${all.length} projects`);
    return all;
  }

  /**
   * Main scraping function: uses API first (all projects, full details).
   * Falls back to HTML scraping if API fails.
   */
  async scrapeProjects(): Promise<ColosseumProject[]> {
    try {
      return await this.scrapeProjectsFromApi();
    } catch (apiError) {
      console.warn("⚠️  [SCRAPER] API failed, falling back to HTML scraping:", apiError);
      return this.scrapeProjectsFromHtml();
    }
  }

  /**
   * Legacy: scrape project list from HTML then fetch each project page for details.
   */
  async scrapeProjectsFromHtml(): Promise<ColosseumProject[]> {
    console.log("🔍 [SCRAPER] Starting Colosseum HTML scraping...");
    console.log(`🔍 [SCRAPER] Target URL: ${this.baseUrl}`);

    const response = await fetch(this.baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SparkBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const projectSlugs = this.parseProjectSlugsFromHTML(html);
    if (projectSlugs.length === 0) return [];

    const projects: ColosseumProject[] = [];
    for (const slug of projectSlugs) {
      try {
        const projectDetails = await this.fetchProjectDetails(slug);
        if (projectDetails) projects.push(projectDetails);
      } catch (error) {
        console.error(`  ❌ [SCRAPER] Failed to fetch ${slug}:`, error);
      }
    }
    return projects;
  }

  /**
   * Scrape a single project by slug (for testing / debugging).
   * Fetches the project detail page and returns parsed data.
   */
  async scrapeOneProject(slug: string): Promise<ColosseumProject | null> {
    console.log(`🔍 [SCRAPER] Single-project scrape: ${slug}`);
    return this.fetchProjectDetails(slug);
  }

  /**
   * Fetch full details for a single project
   */
  private async fetchProjectDetails(slug: string): Promise<ColosseumProject | null> {
    const projectUrl = `https://colosseum.com/agent-hackathon/projects/${slug}`;
    console.log(`  🔍 [SCRAPER] Fetching: ${projectUrl}`);

    try {
      const response = await fetch(projectUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SparkBot/1.0)',
          'Accept': 'text/html',
        }
      });

      if (!response.ok) {
        console.warn(`  ⚠️  [SCRAPER] HTTP ${response.status} for ${slug}`);
        return null;
      }

      const html = await response.text();
      return this.parseProjectDetailPage(html, slug);

    } catch (error) {
      console.error(`  ❌ [SCRAPER] Error fetching ${slug}:`, error);
      return null;
    }
  }

  /**
   * Parse individual project page for full details
   */
  private parseProjectDetailPage(html: string, slug: string): ColosseumProject | null {
    try {
      // Extract title: prefer <title> and clean suffixes; avoid generic "Project | Agent Hackathon"
      let title = slug;
      const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleTagMatch) {
        const raw = this.cleanText(titleTagMatch[1])
          .replace(/\s*\|\s*Colosseum\s*$/i, '')
          .replace(/\s*\|\s*Agent Hackathon\s*$/i, '');
        if (raw && !/^Project\s*\|/i.test(raw)) title = raw;
      }
      const h1Matches = html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi);
      for (const h1 of h1Matches) {
        const t = this.cleanText(h1[1]).replace(/\s*\|\s*Colosseum\s*$/i, '').replace(/\s*\|\s*Agent Hackathon\s*$/i, '');
        if (t && t.length < 80 && !/^Project\s*\|/i.test(t)) {
          title = t;
          break;
        }
      }

      // Description: content between Description heading and Links / Team Members
      let description = "No description available";
      const descBlockMatch = html.match(/Description[\s\S]*?<\/h[^>]*>[\s\S]*?([\s\S]*?)(?=Links|Team Members|<\/section|<\/article|##\s*Links)/i);
      if (descBlockMatch && descBlockMatch[1]) {
        description = descBlockMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      if (description.length < 30) {
        const descDivMatch = html.match(/Description[^<]*<\/h[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i);
        if (descDivMatch && descDivMatch[1]) {
          description = descDivMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (description.length < 30) {
          const descPMatch = html.match(/Description[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
          if (descPMatch && descPMatch[1]) {
            description = descPMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }
        }
      }
      if (description.length > 0) description = this.cleanText(description);

      // Team name: "by slug" or "Team: X's Team" - use strict patterns to avoid capturing categories/tags
      let teamName = 'Unknown Team';
      const byMatch = html.match(/by\s*([a-z0-9_-]+)(?:\s*\||\s*Team:|['\s]|$)/i);
      if (byMatch) teamName = byMatch[1];
      else {
        const teamLabelMatch = html.match(/Team:\s*([a-z0-9_-]+)(?:'s Team)?/i);
        if (teamLabelMatch) teamName = teamLabelMatch[1];
      }

      // Vote counts: find triplets (human, agent, total); take last occurrence or the one near "Vote"
      let humanVotes = 0, agentVotes = 0, totalVotes = 0;
      const voteTripletRegex = /(\d+)\s+(\d+)\s+(\d+)/g;
      let voteMatch;
      const triplets: [number, number, number][] = [];
      while ((voteMatch = voteTripletRegex.exec(html)) !== null) {
        const a = parseInt(voteMatch[1], 10), b = parseInt(voteMatch[2], 10), c = parseInt(voteMatch[3], 10);
        if (a <= 1000 && b <= 1000 && c <= 1000) triplets.push([a, b, c]);
      }
      if (triplets.length > 0) {
        const last = triplets[triplets.length - 1];
        humanVotes = last[0];
        agentVotes = last[1];
        totalVotes = last[2];
        if (triplets.length >= 2 && triplets[triplets.length - 1].every((v, i) => v === triplets[triplets.length - 2][i])) {
          totalVotes = Math.max(last[2], triplets[triplets.length - 2][2]);
        }
      }

      const isDraft = html.toLowerCase().includes('draft');

      // Categories: known list + "Payments", "New Markets"; dedupe and confine to tag-like words
      const knownCategories = ['Trading', 'DeFi', 'AI', 'NFT', 'Gaming', 'Social', 'Infrastructure', 'DAO', 'Payments', 'New Markets'];
      const categories: string[] = [];
      for (const name of knownCategories) {
        const re = new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (re.test(html) && !categories.some(c => c.toLowerCase() === name.toLowerCase())) {
          categories.push(name);
        }
      }

      // Repository link (View Repository)
      let repoUrl = '';
      const repoMatch = html.match(/href="(https:\/\/github\.com[^"]+)"/i);
      if (repoMatch) repoUrl = repoMatch[1];

      // Technical Demo link
      let demoUrl = '';
      const demoMatch = html.match(/Technical\s*Demo[\s\S]*?href="(https?:\/\/[^"]+)"/i) ||
                        html.match(/href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?Technical\s*Demo/i);
      if (demoMatch) demoUrl = demoMatch[1];

      // Token address
      let tokenAddress = '';
      const tokenMatch = html.match(/\$[A-Za-z0-9]+\s*:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
      if (tokenMatch) tokenAddress = tokenMatch[0].replace(/\s*:\s*/, ': ').trim();

      // Team members: "nameJoined M/D/YYYY" or "name Joined MM/DD/YYYY"
      const teamMembers: string[] = [];
      const nameJoinedRegex = /([A-Za-z0-9_-]+)\s*Joined\s*(\d{1,2}\/\d{1,2}\/\d{4})/g;
      let m;
      while ((m = nameJoinedRegex.exec(html)) !== null) {
        const name = this.cleanText(m[1]);
        if (name.length > 0 && name.length < 50) teamMembers.push(`${name} — Joined ${m[2]}`);
      }
      if (teamMembers.length === 0 && teamName !== 'Unknown Team') {
        teamMembers.push(teamName);
      }

      const project: ColosseumProject = {
        title,
        description,
        teamName,
        status: isDraft ? 'Draft' : 'Published',
        humanVotes,
        agentVotes,
        totalVotes,
        colosseumUrl: `https://colosseum.com/agent-hackathon/projects/${slug}`,
        colosseumProjectId: slug,
        slug: this.generateSlug(title),
        categories: categories.length > 0 ? categories : undefined,
        repositoryUrl: repoUrl || undefined,
        demoUrl: demoUrl || undefined,
        teamMembers: teamMembers.length > 0 ? teamMembers : undefined,
        tokenAddress: tokenAddress || undefined
      };

      console.log(`  ✓ [SCRAPER] Parsed full details: ${title}`);
      console.log(`    Description length: ${description.length} chars`);
      console.log(`    Team: ${teamName}`);
      console.log(`    Votes: ${humanVotes}h/${agentVotes}a/${totalVotes}t`);
      if (categories.length > 0) {
        console.log(`    Categories: ${categories.join(', ')}`);
      }

      return project;

    } catch (error) {
      console.error(`  ❌ [SCRAPER] Failed to parse project page for ${slug}:`, error);
      return null;
    }
  }

  /**
   * Parse project slugs from list page
   * Gets just the slugs, then we fetch full details separately
   */
  private parseProjectSlugsFromHTML(html: string): string[] {
    try {
      console.log("🔍 [SCRAPER] Searching for project links...");

      // Find all project links: <a href="./projects/[slug]"> or href="/agent-hackathon/projects/[slug]"
      const projectLinkRegex = /href="(?:\.\/projects\/|\/agent-hackathon\/projects\/)([^"]+)"/g;
      const projectSlugs: Set<string> = new Set();
      let match;

      while ((match = projectLinkRegex.exec(html)) !== null) {
        projectSlugs.add(match[1]);
      }

      console.log(`🔍 [SCRAPER] Found ${projectSlugs.size} unique project links`);

      if (projectSlugs.size === 0) {
        console.warn("⚠️  [SCRAPER] No project links found. HTML structure may have changed.");
        console.log("🔍 [SCRAPER] Searching for alternative patterns...");

        // Try alternative pattern
        const altRegex = /\/projects\/([a-z0-9-]+)/g;
        while ((match = altRegex.exec(html)) !== null) {
          projectSlugs.add(match[1]);
        }
        console.log(`🔍 [SCRAPER] Alternative search found ${projectSlugs.size} projects`);
      }

      return Array.from(projectSlugs);
    } catch (error) {
      console.error("❌ [SCRAPER] Failed to parse HTML:", error);
      return [];
    }
  }

  /**
   * Extract individual project data from HTML
   */
  private extractProjectData(html: string, slug: string): ColosseumProject | null {
    try {
      // Find the section containing this project - more flexible pattern
      const patterns = [
        // Pattern 1: Standard link with h3
        new RegExp(`href="[^"]*projects\/${slug}"[^>]*>.*?<h3[^>]*>([^<]+)<\/h3>.*?(?:<p[^>]*>([^<]+)<\/p>)?.*?(?:·\\s*([^<·]+))?`, 'is'),
        // Pattern 2: Simpler pattern
        new RegExp(`${slug}"[^>]*>.*?<h3[^>]*>([^<]+)<\/h3>`, 'is'),
      ];

      let match = null;
      for (const pattern of patterns) {
        match = html.match(pattern);
        if (match) break;
      }

      if (!match || !match[1]) {
        console.warn(`  ⚠️  [SCRAPER] Could not extract data for project: ${slug}`);
        // Return minimal project data
        return {
          title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: "No description available",
          teamName: "Unknown Team",
          status: "Published",
          humanVotes: 0,
          agentVotes: 0,
          totalVotes: 0,
          colosseumUrl: `https://colosseum.com/agent-hackathon/projects/${slug}`,
          colosseumProjectId: slug,
          slug: slug
        };
      }

      const title = this.cleanText(match[1]);
      const description = match[2] ? this.cleanText(match[2]) : "No description available";
      const teamName = match[3] ? this.cleanText(match[3].replace(/['']s Team/, '').trim()) : "Unknown Team";

      // Try to find vote counts (pattern: "X Y Z" where X=human, Y=agent, Z=total)
      // Look for numbers pattern near the project
      const slugIndex = html.indexOf(`projects/${slug}`);
      if (slugIndex > -1) {
        const contextStart = Math.max(0, slugIndex - 500);
        const contextEnd = Math.min(html.length, slugIndex + 500);
        const context = html.substring(contextStart, contextEnd);

        const votePattern = /(\d+)\s+(\d+)\s+(\d+)/;
        const voteMatch = context.match(votePattern);

        const humanVotes = voteMatch ? parseInt(voteMatch[1]) : 0;
        const agentVotes = voteMatch ? parseInt(voteMatch[2]) : 0;
        const totalVotes = voteMatch ? parseInt(voteMatch[3]) : 0;

        // Check for Draft status
        const isDraft = context.toLowerCase().includes("draft");

        const project: ColosseumProject = {
          title,
          description,
          teamName,
          status: isDraft ? "Draft" : "Published",
          humanVotes,
          agentVotes,
          totalVotes,
          colosseumUrl: `https://colosseum.com/agent-hackathon/projects/${slug}`,
          colosseumProjectId: slug,
          slug: this.generateSlug(title)
        };

        console.log(`  ✓ [SCRAPER] Parsed: ${title} (${humanVotes}h/${agentVotes}a/${totalVotes}t votes)`);
        return project;
      }

      return null;

    } catch (error) {
      console.error(`  ❌ [SCRAPER] Failed to extract project ${slug}:`, error);
      return null;
    }
  }

  /**
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Parse a single project card element (legacy method for reference)
   * This would be used within page.evaluate() with a real browser
   */
  private parseProjectCard(element: any): ColosseumProject | null {
    try {
      const title = element.querySelector('.project-title')?.textContent?.trim();
      const description = element.querySelector('.project-description')?.textContent?.trim();
      const teamName = element.querySelector('.team-name')?.textContent?.trim();
      const status = element.querySelector('.status-badge')?.textContent?.trim() || 'Draft';

      // Extract vote counts (adjust selectors based on actual HTML)
      const humanVotes = parseInt(element.querySelector('.human-votes')?.textContent || '0');
      const agentVotes = parseInt(element.querySelector('.agent-votes')?.textContent || '0');
      const totalVotes = parseInt(element.querySelector('.total-votes')?.textContent || '0');

      // Extract project ID from URL
      const projectLink = element.querySelector('a[href*="/projects/"]');
      const projectUrl = projectLink?.href || '';
      const projectIdMatch = projectUrl.match(/\/projects\/([^\/]+)/);
      const colosseumProjectId = projectIdMatch ? projectIdMatch[1] : '';

      if (!title || !description || !teamName || !colosseumProjectId) {
        return null;
      }

      return {
        title,
        description,
        teamName,
        status,
        humanVotes,
        agentVotes,
        totalVotes,
        colosseumUrl: `https://colosseum.com/agent-hackathon/projects/${colosseumProjectId}`,
        colosseumProjectId,
        slug: this.generateSlug(title)
      };
    } catch (error) {
      console.error("Error parsing project card:", error);
      return null;
    }
  }

  /**
   * Transform scraped data to database schema
   */
  private transformToSchema(rawProject: ColosseumProject) {
    return {
      title: rawProject.title,
      description: rawProject.description,
      teamName: rawProject.teamName,
      status: rawProject.status,
      humanVotes: rawProject.humanVotes,
      agentVotes: rawProject.agentVotes,
      totalVotes: rawProject.totalVotes,
      colosseumUrl: rawProject.colosseumUrl,
      colosseumProjectId: rawProject.colosseumProjectId,
      slug: rawProject.slug,
      scrapedAt: new Date().toISOString()
    };
  }

  /**
   * Upsert projects into database
   * Updates existing projects or inserts new ones
   */
  async upsertProjects(projects: ColosseumProject[]): Promise<{ updated: number; new: number }> {
    console.log(`🔍 [SCRAPER] Upserting ${projects.length} projects to database...`);
    let updatedCount = 0;
    let newCount = 0;

    for (const project of projects) {
      try {
        console.log(`🔍 [SCRAPER] Processing: ${project.title} (${project.colosseumProjectId})`);

        // Check if project already exists
        const existing = await this.db
          .prepare("SELECT id FROM agent_projects WHERE colosseum_project_id = ?")
          .bind(project.colosseumProjectId)
          .first<{ id: string }>();

        const scrapedAt = new Date().toISOString();

        if (existing) {
          console.log(`  ↻ [SCRAPER] Updating existing project: ${project.title}`);
          const fullUpdate = `UPDATE agent_projects
               SET description = ?, human_votes = ?, agent_votes = ?, total_votes = ?,
                   categories = ?, repository_url = ?, demo_url = ?, team_members = ?, token_address = ?,
                   scraped_at = ?, updated_at = ?
               WHERE colosseum_project_id = ?`;
          const minimalUpdate = `UPDATE agent_projects
               SET description = ?, human_votes = ?, agent_votes = ?, total_votes = ?,
                   scraped_at = ?, updated_at = ?
               WHERE colosseum_project_id = ?`;
          try {
            await this.db
              .prepare(fullUpdate)
              .bind(
                project.description,
                project.humanVotes,
                project.agentVotes,
                project.totalVotes,
                project.categories ? JSON.stringify(project.categories) : '[]',
                project.repositoryUrl || null,
                project.demoUrl || null,
                project.teamMembers ? JSON.stringify(project.teamMembers) : '[]',
                project.tokenAddress || null,
                scrapedAt,
                scrapedAt,
                project.colosseumProjectId
              )
              .run();
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            if (err.includes('no such column') || err.includes('SQLITE_ERROR')) {
              await this.db
                .prepare(minimalUpdate)
                .bind(
                  project.description,
                  project.humanVotes,
                  project.agentVotes,
                  project.totalVotes,
                  scrapedAt,
                  scrapedAt,
                  project.colosseumProjectId
                )
                .run();
            } else {
              throw e;
            }
          }
          updatedCount++;
          console.log(`  ✓ [SCRAPER] Updated: ${project.title}`);
        } else {
          console.log(`  + [SCRAPER] Inserting new project: ${project.title}`);
          // Insert new project
          const id = this.generateUUID();
          let slug = project.slug;

          // Ensure slug is unique
          let slugCounter = 1;
          while (true) {
            const slugExists = await this.db
              .prepare("SELECT id FROM agent_projects WHERE slug = ?")
              .bind(slug)
              .first();

            if (!slugExists) break;
            slug = `${project.slug}-${slugCounter}`;
            slugCounter++;
          }

          const fullInsert = `INSERT INTO agent_projects (
                id, title, slug, description, team_name, status,
                human_votes, agent_votes, total_votes,
                colosseum_url, colosseum_project_id,
                estimated_price, raised_amount,
                categories, repository_url, demo_url, team_members, token_address,
                scraped_at, created_at, updated_at
              )
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`;
          const minimalInsert = `INSERT INTO agent_projects (
                id, title, slug, description, team_name, status,
                human_votes, agent_votes, total_votes,
                colosseum_url, colosseum_project_id,
                estimated_price, raised_amount,
                treasury_wallet, generated_image_url, market_analysis,
                scraped_at, created_at, updated_at
              )
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`;
          try {
            await this.db
              .prepare(fullInsert)
              .bind(
                id,
                project.title,
                slug,
                project.description,
                project.teamName,
                project.status,
                project.humanVotes,
                project.agentVotes,
                project.totalVotes,
                project.colosseumUrl,
                project.colosseumProjectId,
                0, // estimated_price
                0, // raised_amount
                project.categories ? JSON.stringify(project.categories) : '[]',
                project.repositoryUrl || null,
                project.demoUrl || null,
                project.teamMembers ? JSON.stringify(project.teamMembers) : '[]',
                project.tokenAddress || null,
                scrapedAt,
                scrapedAt,
                scrapedAt
              )
              .run();
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            if (err.includes('no such column') || err.includes('SQLITE_ERROR')) {
              await this.db
                .prepare(minimalInsert)
                .bind(
                  id,
                  project.title,
                  slug,
                  project.description,
                  project.teamName,
                  project.status,
                  project.humanVotes,
                  project.agentVotes,
                  project.totalVotes,
                  project.colosseumUrl,
                  project.colosseumProjectId,
                  0, // estimated_price
                  0, // raised_amount
                  null, // treasury_wallet
                  null, // generated_image_url
                  null, // market_analysis
                  scrapedAt,
                  scrapedAt,
                  scrapedAt
                )
                .run();
            } else {
              throw e;
            }
          }
          newCount++;
          console.log(`  ✓ [SCRAPER] Inserted: ${project.title}`);
        }
      } catch (error) {
        console.error(`❌ [SCRAPER] Failed to upsert project ${project.title}:`, error);
      }
    }

    console.log(`✅ [SCRAPER] Upsert complete: ${newCount} new, ${updatedCount} updated`);
    return { updated: updatedCount, new: newCount };
  }

  /**
   * Main update function called by scheduled job
   */
  async updateProjects(): Promise<{ success: boolean; updated: number; new: number; error?: string }> {
    try {
      const projects = await this.scrapeProjects();
      const result = await this.upsertProjects(projects);

      console.log(`✅ Scraping complete: ${result.new} new, ${result.updated} updated`);

      return {
        success: true,
        updated: result.updated,
        new: result.new
      };
    } catch (error) {
      console.error("❌ Update failed:", error);
      return {
        success: false,
        updated: 0,
        new: 0,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  // Helper functions
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private generateUUID(): string {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (
        +c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
      ).toString(16)
    );
  }
}
