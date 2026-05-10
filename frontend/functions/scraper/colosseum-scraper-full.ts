// Full scraper with Puppeteer support for infinite scroll
// This gets ALL 118 projects, not just the first 24

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
}

export class ColosseumScraperFull {
  private db: D1Database;
  private baseUrl = "https://colosseum.com/agent-hackathon/projects";

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Full scraper using Puppeteer
   * NOTE: Requires @cloudflare/puppeteer package
   */
  async scrapeAllProjects(): Promise<ColosseumProject[]> {
    console.log("🔍 [FULL-SCRAPER] Starting FULL Colosseum scraping with Puppeteer...");

    try {
      // Dynamic import of puppeteer (only available in Cloudflare Workers)
      // Uncomment when Puppeteer is added to dependencies
    
      const puppeteer = await import('@cloudflare/puppeteer');

      const browser = await puppeteer.launch({
        headless: true
      });

      const page = await browser.newPage();

      console.log("🔍 [FULL-SCRAPER] Navigating to Colosseum...");
      await page.goto(this.baseUrl, { waitUntil: 'networkidle0' });

      console.log("🔍 [FULL-SCRAPER] Scrolling to load all projects...");

      let previousCount = 0;
      let currentCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 20;

      // Scroll until no new projects load
      while (scrollAttempts < maxScrollAttempts) {
        // Count current projects
        currentCount = await page.evaluate(() => {
          return document.querySelectorAll('a[href*="/projects/"]').length;
        });

        console.log(`🔍 [FULL-SCRAPER] Found ${currentCount} projects (attempt ${scrollAttempts + 1}/${maxScrollAttempts})`);

        // If no new projects loaded, we're done
        if (currentCount === previousCount && scrollAttempts > 2) {
          console.log("✅ [FULL-SCRAPER] No more projects loading, finishing...");
          break;
        }

        previousCount = currentCount;

        // Scroll to bottom
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait for new content to load
        await page.waitForTimeout(2000);

        scrollAttempts++;
      }

      console.log("🔍 [FULL-SCRAPER] Extracting project data...");

      // Extract all project data
      const projects = await page.evaluate(() => {
        const projectLinks = document.querySelectorAll('a[href*="/projects/"]');
        const projectsData = [];

        projectLinks.forEach(link => {
          try {
            const href = link.getAttribute('href');
            const slug = href?.split('/').pop() || '';

            // Find associated data
            const title = link.querySelector('h3')?.textContent?.trim() || '';
            const description = link.querySelector('p')?.textContent?.trim() || '';

            // Find team name (usually after a · separator)
            const teamElement = link.querySelector('[class*="team"]');
            const teamName = teamElement?.textContent?.replace(/·|\s*'s Team/g, '').trim() || 'Unknown Team';

            // Find votes (look for numbers)
            const voteElements = link.querySelectorAll('[class*="vote"]');
            let humanVotes = 0, agentVotes = 0, totalVotes = 0;

            if (voteElements.length >= 3) {
              humanVotes = parseInt(voteElements[0]?.textContent || '0');
              agentVotes = parseInt(voteElements[1]?.textContent || '0');
              totalVotes = parseInt(voteElements[2]?.textContent || '0');
            }

            // Check for Draft
            const isDraft = link.textContent?.includes('Draft') || false;

            if (title && slug) {
              projectsData.push({
                title,
                description: description || 'No description available',
                teamName,
                status: isDraft ? 'Draft' : 'Published',
                humanVotes,
                agentVotes,
                totalVotes,
                colosseumUrl: `https://colosseum.com/agent-hackathon/projects/${slug}`,
                colosseumProjectId: slug,
                slug: slug
              });
            }
          } catch (err) {
            console.error('Error extracting project:', err);
          }
        });

        return projectsData;
      });

      await browser.close();

      console.log(`📦 [FULL-SCRAPER] Extracted ${projects.length} total projects`);
      return projects;

      // Fallback if Puppeteer not available
      console.warn("⚠️  [FULL-SCRAPER] Puppeteer not available. Install with:");
      console.warn("    npm install @cloudflare/puppeteer");
      console.warn("    Then uncomment the Puppeteer code in this file.");

      return [];

    } catch (error) {
      console.error("❌ [FULL-SCRAPER] Full scraping failed:", error);
      throw error;
    }
  }

  /**
   * Alternative: Fetch known project slugs
   * If you have a list of all project slugs, you can fetch them individually
   */
  async scrapeKnownProjects(slugs: string[]): Promise<ColosseumProject[]> {
    console.log(`🔍 [FULL-SCRAPER] Scraping ${slugs.length} known projects...`);

    const projects: ColosseumProject[] = [];

    for (const slug of slugs) {
      try {
        const url = `https://colosseum.com/agent-hackathon/projects/${slug}`;
        const response = await fetch(url);

        if (response.ok) {
          const html = await response.text();
          // Parse individual project page
          const project = this.parseProjectPage(html, slug);
          if (project) {
            projects.push(project);
            console.log(`  ✓ [FULL-SCRAPER] Scraped: ${project.title}`);
          }
        }
      } catch (error) {
        console.error(`  ❌ [FULL-SCRAPER] Failed to scrape ${slug}:`, error);
      }
    }

    return projects;
  }

  private parseProjectPage(html: string, slug: string): ColosseumProject | null {
    // Parse individual project page HTML
    // This would need to be implemented based on the actual page structure
    return null;
  }
}
