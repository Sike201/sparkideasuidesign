// File: functions/scheduled/update-agent-projects.ts
// Cloudflare Cron trigger for periodic agent projects updates.
// Fetches all projects from Colosseum API and upserts into DB.
//
// To enable automatic fetch:
// - wrangler.toml: [triggers] crons = ["0 */6 * * *"] (every 6h UTC)
// - Cloudflare Dashboard: Pages → your project → Settings → Functions → Cron Triggers
//   Add schedule: 0 */6 * * * (every 6 hours)
// - Or call POST /api/admin/refresh-agent-projects manually or from an external cron.

import { ColosseumScraper } from '../scraper/colosseum-scraper';

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
};

// Scheduled handler for Cloudflare Workers
export const onSchedule: ScheduledHandler<ENV> = async (event, env, ctx) => {
  console.log("⏰ Scheduled update triggered at:", new Date().toISOString());

  try {
    const scraper = new ColosseumScraper(env.DB);
    const result = await scraper.updateProjects();

    if (result.success) {
      console.log(`✅ Scheduled update complete: ${result.new} new projects, ${result.updated} updated`);
    } else {
      console.error(`❌ Scheduled update failed: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error("❌ Scheduled update error:", error);
    throw error;
  }
};
